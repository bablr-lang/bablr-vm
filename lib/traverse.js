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

  const result = __traverse(context, { node, state });

  if (!state.tokenizer.done) {
    throw new Error('Traversal did not fully consume source.');
  }

  source_.release();

  return result;
};

export const traverseFragment = (language, node, source, context = Context.from(language)) => {
  const state = State.from(source);

  return __traverse(context, { node, state });
};

function __traverse(ctx, initial) {
  let debug_ = false;
  let s = initial.state;

  if (!ctx.nodeGrammar.aliases.has('Node')) {
    throw new Error('A Node alias is required');
  }

  {
    const initialPath = Path.from(ctx, Fragment, initial.node);

    s.pushCo(
      Coroutine.from(ctx.nodeGrammar, initial.node.type, {
        context: facades.get(ctx),
        state: facades.get(s),
        value: undefined,
        property: null,
      }),
    );

    ctx.paths.set(s.co, initialPath);
    ctx.prevTokens.set(s.co, s.result);
  }

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

              let path = s.path;

              if (ctx.nodeGrammar.is('Node', type)) {
                const resolvedProperty = s.resolver.resolve(property);
                const child = get(s.node, resolvedProperty);

                if (!child || !ctx.nodeGrammar.is(type, child.type)) {
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

                path = Path.from(ctx.nodeGrammar, type, child, path, resolvedProperty);
              } else {
                if (instr.type !== eat) {
                  s = s.branch();
                }

                path = null;
              }

              s.pushCo(
                Coroutine.from(ctx.nodeGrammar, path ? path.node.type : type, {
                  context: facades.get(ctx),
                  state: facades.get(s),
                  value,
                  property,
                }),
              );

              ctx.paths.set(s.co, path);
              ctx.prevTokens.set(s.co, s.result);

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

          const path = ctx.paths.get(s.co);

          if (!ctx.nodeGrammar.has(path.node.type) && !ctx.nodeGrammar.aliases.has(path.type)) {
            throw new Error('startNodeInstruction.type was not a valid type');
          }

          const startNodeToken = createToken(StartNode, undefined);
          const partialRange = [startNodeToken, null];

          ctx.ranges.set(path, partialRange);
          ctx.ranges.set(startNodeToken, partialRange);
          ctx.prevTokens.set(startNodeToken, s.result);
          ctx.paths.set(startNodeToken, path);

          s.path = path;
          s.resolver = s.resolver ? s.resolver.branch(s.node) : Resolver.from(s.node);
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
          const partialRange = ctx.ranges.get(path);

          if (!partialRange?.[0]) {
            throw new Error('Cannot end node, it has not started.');
          }

          if (partialRange[1] != null) {
            throw new Error('Cannot end node, it has already ended.');
          }

          const startNodeToken = partialRange[0];
          const endNodeToken = { type: EndNode, value: undefined };
          const range = [startNodeToken, endNodeToken];

          if (ctx.prevTokens.get(endNodeToken) === startNodeToken) {
            throw new Error('node must not match an empty range');
          }

          ctx.ranges.set(path, range);
          ctx.ranges.set(startNodeToken, range);
          ctx.ranges.set(endNodeToken, range);
          ctx.prevTokens.set(endNodeToken, s.result);
          ctx.paths.set(endNodeToken, path);

          s.path = path.parent;
          s.resolver = s.resolver.accept();
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
      const range =
        s.status === rejected
          ? null
          : ctx.getRangeFromPreviousAndFinal(ctx.prevTokens.get(s.co), s.result);

      if (range) ctx.ranges.set(s.co, range);

      s.popCo();

      if (!range) while (s.co) s.popCo();

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
