import { exec, parse as parseRegex } from '@iter-tools/regex';

import { get, isType } from './utils/object.js';
import { formatType } from './utils/format.js';
import { facades } from './utils/facades.js';
import { createToken, assertValidRegex } from './utils/token.js';
import { getGuardPattern } from './utils/guard.js';
import { Coroutine } from './coroutine.js';
import { State } from './traverse.state.js';
import { Context } from './context.js';
import { Path } from './path.js';
import { Source } from './source.js';
import { Resolver } from './resolver.js';
import { tokenize } from './tokenize.js';
import * as sym from './symbols.js';
import {
  _actual,
  none,
  defer,
  Fragment,
  eat,
  match,
  eatMatch,
  fail,
  active,
  rejected,
  startNode,
  endNode,
  StartNode,
  EndNode,
} from './symbols.js';

export const traverse = (language, node, source, context = Context.from(language)) => {
  const source_ = Source.from(source);
  const state = State.from(source_);

  const result = __traverse(context, node, state);

  if (!state.tokenizer.done) {
    throw new Error('Traversal did not fully consume source.');
  }

  source_.release();

  return result;
};

export const traverseFragment = (language, node, source, context = Context.from(language)) => {
  const state = State.from(source);

  return __traverse(context, node, state);
};

function __traverse(context, rootNode, initialState) {
  const ctx = context;
  const { nodeGrammar: grammar, ranges, prevTokens, paths } = ctx;
  const rootPath = Path.from(ctx, Fragment, rootNode);
  let debug_ = false;
  let s = initialState;

  if (!grammar.aliases.has('Node')) {
    throw new Error('A Node alias is required');
  }

  s.pushCo(
    Coroutine.from(grammar, rootNode.type, {
      context: facades.get(context),
      path: rootPath,
      state: facades.get(s),
      value: undefined,
      property: null,
    }),
  );

  paths.set(s.co, rootPath);
  prevTokens.set(s.co, s.result);

  for (;;) {
    // checking done here can cause me to skip the last instruction!
    while (s.status === active && !s.co.done) {
      // The production generator has just yielded an instruction
      const { value: instr } = s.co;
      const { error: cause } = instr;

      if (!isType(instr.type)) throw new Error(`instruction.type must be a type`);

      const instructionType = formatType(instr.type).replace(/^\[(.*)\]$/, '$1');
      let returnValue = none;

      if (debug_) {
        debug_ = false;
        debugger;
      }

      switch (instr.type) {
        case match:
        case eatMatch:
        case eat: {
          const matchable = instr.value;

          switch (matchable.type) {
            case sym.node: {
              const { type, property, value } = matchable.value;

              if (!isType(type)) {
                throw new Error(`${instructionType}.value.type must be a type`);
              }

              const production = grammar.get(type);
              const guard = production.annotations?.get('guard');

              let guardMatch = undefined;

              if (guard) {
                const _guard = getGuardPattern(guard, value, s.tokenizer);

                [guardMatch] = exec(parseRegex(_guard), s.tokenizer.source);

                if (!guardMatch) {
                  if (instr.type === eat) {
                    s.reject();
                  } else {
                    returnValue = null;
                  }
                  break;
                }
              }

              let path = s.path;

              if (grammar.is('Node', type)) {
                const resolvedProperty = s.resolver.resolve(property);
                const child = get(s.node, resolvedProperty);

                if (!child) throw new Error(`failed to resolve prod\`${property}\``);

                if (child.type !== type) {
                  if (instr.type === eat) {
                    s.reject();
                  } else {
                    returnValue = null;
                  }
                  break;
                }

                if (instr.type !== eat) {
                  s = s.branch();
                }

                s.resolver.consume(property);

                path = Path.from(grammar, type, child, path, resolvedProperty);
              } else {
                if (instr.type !== eat) {
                  s = s.branch();
                }

                path = null;
              }

              s.pushCo(
                Coroutine.from(grammar, type, {
                  context: facades.get(context),
                  path: facades.get(path),
                  state: facades.get(s),
                  value,
                  property,
                  guardMatch,
                }),
              );

              paths.set(s.co, path);
              prevTokens.set(s.co, s.result);

              if (type !== eat) {
                s.resolvers = s.resolvers.push(s.resolver.branch());
              }

              returnValue = defer;
              break;
            }

            case sym.token: {
              const { type, value, alterLexicalContext } = matchable.value;

              if (!isType(type)) {
                throw new Error(`${instructionType}.value.type must be a type`);
              }

              const production = ctx.tokenGrammar.get(type);

              let guardMatch = undefined;

              const guard = production.annotations?.get('guard');

              if (guard) {
                const guardPattern = getGuardPattern(guard, value, s.tokenizer);

                assertValidRegex(guardPattern);

                [guardMatch] = exec(parseRegex(guardPattern), s.tokenizer.source);

                if (!guardMatch) {
                  if (instr.type === eat) {
                    s.reject();
                  } else {
                    returnValue = null;
                  }
                  break;
                }
              }

              if (alterLexicalContext) throw new Error();

              let { tokenizer: ts } = s;

              ts.status = active;

              if (instr.type !== eat) {
                ts = ts.branch();
              }

              const range = tokenize(ctx, ts, type, value, guardMatch);

              if (instr.type !== eat) {
                if (range && instr.type !== match) {
                  s.tokenizer = ts.accept();
                } else {
                  ts.reject();
                }
              } else if (!range) {
                s.reject();
              }

              returnValue = range;
              break;
            }

            default:
              throw new Error('matchable.type must be sym.node or sym.token');
          }
          break;
        }

        case fail: {
          s.reject();

          s.co.return();

          returnValue = none;
          break;
        }

        case startNode: {
          // if (instr.value !== undefined) {
          //   throw new Error();
          // }

          const path = paths.get(s.co);

          if (!grammar.has(path.node.type) && !grammar.aliases.has(path.type)) {
            throw new Error('startNodeInstruction.type was not a valid type');
          }

          const startNodeToken = createToken(StartNode, undefined);
          const partialRange = [startNodeToken, null];

          ranges.set(path, partialRange);
          ranges.set(startNodeToken, partialRange);
          prevTokens.set(startNodeToken, s.result);
          paths.set(startNodeToken, path);

          s.path = path;
          s.resolvers = s.resolvers.push(Resolver.from(s.node));
          s.tokenizer.result = startNodeToken;

          returnValue = [startNodeToken, null];
          break;
        }

        case endNode: {
          // if (instr.value !== undefined) {
          //   throw new Error();
          // }

          if (s.lexicalContext !== 'Bare') {
            throw new Error('Cannot end a node outside the Bare lexical context');
          }

          const path = s.path;
          const partialRange = ranges.get(path);

          if (!partialRange?.[0]) {
            throw new Error('Cannot end node, it has not started.');
          }

          if (partialRange[1] != null) {
            throw new Error('Cannot end node, it has already ended.');
          }

          const startNodeToken = partialRange[0];
          const endNodeToken = { type: EndNode, value: undefined };
          const range = [startNodeToken, endNodeToken];

          if (prevTokens.get(endNodeToken) === startNodeToken) {
            throw new Error('node must not match an empty range');
          }

          ranges.set(path, range);
          ranges.set(startNodeToken, range);
          ranges.set(endNodeToken, range);
          prevTokens.set(endNodeToken, s.result);
          paths.set(endNodeToken, path);

          s.path = path.parent;
          s.resolvers = s.resolvers.pop();
          s.tokenizer.result = endNodeToken;

          returnValue = [startNodeToken, endNodeToken];
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

      if (returnValue === none) {
        throw new Error('cst-tokens: unanticipated case: returnValue is none');
      } else if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!s.co.done) {
        s.co.advance(returnValue);
      }
    }

    // resume suspended execution

    {
      const range = ctx.getRangeFromPreviousAndFinal(prevTokens.get(s.co), s.result);

      if (range) ranges.set(s.co, range);

      s.popCo();

      if (range) {
      } else {
        while (s.co) s.popCo();
      }

      if (!s.co) {
        if (s.parent?.co) {
          s = s.status === sym.active ? (range ? s.accept() : s.reject()) : s.parent;
          s.status = active;
        } else {
          break;
        }
      }

      s.co.advance(range);
    }
  }
}
