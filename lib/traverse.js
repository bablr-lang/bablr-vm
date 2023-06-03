import escapeRegex from 'escape-string-regexp';
import { parse as parseRegex, exec } from '@iter-tools/regex';

import { freezeSeal, get, isString, isType, isObject } from './utils/object.js';
import { formatType } from './utils/format.js';
import { facades } from './utils/facades.js';
import { createToken, assertValidRegex } from './utils/token.js';
import { Match } from './match.js';
import { State } from './traverse.state.js';
import { Context } from './context.js';
import { Path } from './path.js';
import { Source } from './source.js';
import { Resolver } from './resolver.js';
import { maybeUpdateLexicalContext, tokenize, matchFrom as tokenMatchFrom } from './tokenize.js';
import * as sym from './symbols.js';
import { _none, defer, match, fail, startNode, endNode, active, rejected } from './symbols.js';

export const matchFrom = (context, state, path, type) => {
  const value = undefined;
  const type_ = path ? path.node.type : type;
  const matchable = { type: sym.node, value: { type: type_, property: null, value } };

  const m = Match.from(context, state, matchable, { path: facades.get(path), value });

  context.pathsMap.set(m, path);

  return m;
};

export function* traverse(language, node, source, context = Context.from(language)) {
  const path = Path.from(context, node);
  const state = State.from(context, Source.from(context, source), node);
  const match = matchFrom(context, state, path, node.type);

  yield* __traverse(match);

  if (!match.state.tokenState.done) {
    throw new Error('Traversal did not fully consume source.');
  }
}

export function traverseFragment(language, node, source, context = Context.from(language)) {
  const path = Path.from(context, node);
  const state = State.from(context, source.branch(), node.type);
  const match = matchFrom(context, state, path, node.type);

  return __traverse(match);
}

function* __traverse(rootMatch) {
  const { ctx } = rootMatch;
  const grammar = ctx.grammars.get(sym.node);
  let debug_ = false;
  let m = rootMatch;
  let { s } = m;

  for (;;) {
    // checking done here can cause me to skip the last instruction!
    while (s.status === active && !m.co.done) {
      freezeSeal(m.co.value);

      // The production generator has just yielded an instruction
      const { value: instr } = m.co;
      const { error: cause } = instr;

      if (!isType(instr.type)) throw new Error(`instruction.type must be a type`);

      const instructionType = formatType(instr.type).replace(/^\[(.*)\]$/, '$1');
      let returnValue = _none;

      if (debug_) {
        debug_ = false;
        debugger;
      }

      switch (instr.type) {
        case match: {
          freezeSeal(instr.value);

          const matchInstruction = instr.value;

          freezeSeal(matchInstruction.matchable);

          const { matchable, successEffect, failureEffect } = matchInstruction;

          switch (matchable.type) {
            case sym.node: {
              const { type, property, value } = matchable.value;
              const isNode = grammar.is('Node', type);

              if (!isType(type)) {
                throw new Error(`${instructionType}.value.type must be a type`);
              }

              let path = null;

              if (isNode) {
                const resolvedProperty = s.resolver.resolve(property);
                const child = get(s.node, resolvedProperty);

                if (!child || !grammar.is(type, child.type)) {
                  if (failureEffect === sym.fail) {
                    m.terminate();
                  }
                  returnValue = null;
                  break;
                }

                path = ctx.paths.push(s.path, Path.from(ctx, child, resolvedProperty, type));
              }

              const props = { path: facades.get(path), value };

              m = m.exec(matchInstruction, props, (type) => (path ? path.node.type : type));
              ({ s } = m);

              ctx.pathsMap.set(m, path);

              if (isNode) {
                s.resolver.consume(property);
              }

              returnValue = defer;
              break;
            }

            case sym.token: {
              const { type } = matchable.value;

              if (!isType(type)) {
                throw new Error(`${instructionType}.value.type must be a type`);
              }

              const shouldBranch = successEffect === sym.none || failureEffect === sym.none;

              const ts = shouldBranch ? s.tokenState.branch() : s.tokenState;

              maybeUpdateLexicalContext(ts, matchable);

              ts.status = active;

              const tm = tokenMatchFrom(ctx, ts, matchable);

              tokenize(tm);

              const range = ctx.getRangeFromMatch(tm);

              if (shouldBranch) {
                if (range && successEffect === sym.eat) {
                  s.tokenState.accept(ts);
                } else {
                  ts.reject();
                }
              } else {
                if (!range && successEffect === sym.fail) {
                  m.terminate();
                }
              }

              if (!s.speculative) {
                yield* [...ctx.allTokensFor(range)].reverse();
              }

              returnValue = range;
              break;
            }

            case sym.character: {
              let pattern = matchable.value;

              if (successEffect !== sym.none) {
                throw new Error('Cannot eat characters from a node grammar');
              }

              if (isString(pattern)) {
                pattern = new RegExp(escapeRegex(pattern), 'y');
              }

              assertValidRegex(pattern);

              const [result] = exec(parseRegex(pattern), s.tokenState.source);

              if (!result && failureEffect === sym.fail) {
                m.terminate();
              }

              returnValue = result;
              break;
            }

            case sym.boundary: {
              const { type, value } = matchable.value;

              if (type === startNode || type === endNode) {
                const sourceValue = s.source.value;
                const sourceToken =
                  isObject(sourceValue) && sourceValue.type === type ? { ...sourceValue } : null;
                const token =
                  sourceToken ||
                  // start and end tokens may not really exist
                  // we create them where the grammar tells us they are mandatory!
                  (failureEffect === sym.fail ? createToken(type, value?.type) : null);

                // TODO if startNode token comes from source endNode token must as well

                if (token) {
                  switch (type) {
                    case startNode: {
                      const path = ctx.pathsMap.get(m);

                      if (value.type !== path.node.type) throw new Error();

                      const partialRange = [token, null];

                      ctx.ranges.set(path, partialRange);
                      ctx.ranges.set(token, partialRange);
                      ctx.prevTokens.set(token, s.lastToken);
                      ctx.pathsMap.set(token, path);

                      s.path = path;
                      s.resolvers.set(s.path, Resolver.from(s.node));
                      s.tokenState.lastToken = token;

                      if (!s.speculative) {
                        yield token;
                      }

                      returnValue = token;
                      break;
                    }

                    case endNode: {
                      const path = s.path;
                      const partialRange = ctx.ranges.get(path);

                      if (!partialRange?.[0]) {
                        throw new Error('Cannot end node, it has not started.');
                      }

                      if (partialRange[1] != null) {
                        throw new Error('Cannot end node, it has already ended.');
                      }

                      const startNodeToken = partialRange[0];
                      const endNodeToken = createToken(endNode, path.node.type);
                      const range = [startNodeToken, endNodeToken];

                      if (ctx.prevTokens.get(endNodeToken) === startNodeToken) {
                        throw new Error('node must not match an empty range');
                      }

                      ctx.ranges.set(path, range);
                      ctx.ranges.set(startNodeToken, range);
                      ctx.ranges.set(endNodeToken, range);
                      ctx.prevTokens.set(endNodeToken, s.lastToken);
                      ctx.pathsMap.set(endNodeToken, path);

                      s.resolvers.set(s.path, s.resolver.parent);
                      s.path = path.parent;
                      s.tokenState.lastToken = endNodeToken;

                      if (!s.speculative) {
                        yield endNodeToken;
                      }

                      returnValue = endNodeToken;
                      break;
                    }
                  }
                } else {
                  returnValue = null;
                }
              } else if (type === sym.EOF) {
                returnValue = s.source.done;
                break;
              }

              break;
            }

            default:
              throw new Error('matchable.type must be sym.node or sym.token');
          }
          break;
        }

        case fail: {
          m.terminate();

          returnValue = _none;
          break;
        }

        case 'debug': {
          debug_ = true;

          returnValue = undefined;
          break;
        }

        default:
          throw new Error(
            `Unexpected Instruction of {type: ${formatType(instr.type)}}`,
            cause && { cause },
          );
      }

      if (s.status === rejected) {
        break;
      }

      if (returnValue === _none) {
        throw new Error('cst-tokens: unanticipated case: returnValue is none');
      } else if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!m.co.done) {
        m.co.advance(returnValue);
      }
    }

    // resume suspended execution

    {
      const range = m.capture();

      m = m.terminate();

      if (m) {
        const wasSpeculative = s.speculative;
        ({ s } = m);

        if (range && wasSpeculative && !s.speculative) {
          // How do we know what the last token we emitted was?
          yield* [...ctx.allTokensFor(range)].reverse();
        }

        s.status = active;
        m.co.advance(range);
      } else {
        return;
      }
    }
  }
}
