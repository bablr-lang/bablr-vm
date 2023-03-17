import { get, isString, isType } from './utils/object.js';
import { formatType } from './utils/format.js';
import { facades } from './utils/facades.js';
import { createToken } from './utils/token.js';
import { Coroutine } from './coroutine.js';
import { State } from './traverse.state.js';
import { ContextFacade } from './context.js';
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

export const traverse = (language, node, source, context = ContextFacade.from(language)) => {
  const context_ = context[_actual];
  const path = Path.from(context_, Fragment, node);
  const source_ = Source.from(source);
  const state = State.from(path, source_);

  const result = __traverse(context_, state);

  if (!source.done) {
    throw new Error('Traversal did not fully consume source.');
  }

  source.release();

  return result;
};

export const traverseFragment = (
  language,
  node,
  source,
  context = ContextFacade.from(language),
) => {
  const context_ = context[_actual];
  const path = Path.from(context_, Fragment, node);
  const state = State.from(path, source);

  return __traverse(context_, state);
};

function __traverse(context, initialState) {
  const ctx = context;
  const { nodeGrammar: grammar, ranges, prevTokens, paths } = ctx;
  let debug_ = false;
  let s = initialState;

  if (!grammar.aliases.has('Node')) {
    throw new Error('A Node alias is required');
  }

  s.pushCo(
    Coroutine.from(grammar, s.node.type, {
      context: facades.get(context),
      path: facades.get(s.path),
      state: facades.get(s),
    }),
  );

  paths.set(s.co, s.path);

  for (;;) {
    while (s.status === active && !s.co.done) {
      // The production generator has just yielded an instruction
      const { value: instr } = s.co;
      const { error: cause } = instr;

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
              const { type, props = {} } = matchable.value;
              const { property } = props; // this is a deopt waiting to happen

              let path = s.path;

              if (property) {
                const resolvedProperty = s.resolver.resolve(property);
                const child = get(s.node, resolvedProperty);

                if (!child) throw new Error(`failed to resolve prod\`${property}\``);

                if (!grammar.is('Node', child.type)) throw new Error();

                if (!grammar.is(type, child.type)) {
                  returnValue = null;
                  break;
                }

                if (instr.type !== eat) {
                  s = s.branch();
                }

                s.resolver.consume(property);

                path = Path.from(grammar, type, child, path, resolvedProperty);
              } else {
                if (grammar.is('Node', type)) throw new Error(`Expected ${type} not to be a Node`);

                if (instr.type !== eat) {
                  s = s.branch();
                }
              }

              s.pushCo(
                Coroutine.from(grammar, type, {
                  ...props,
                  context: facades.get(context),
                  path: facades.get(path),
                  state: facades.get(s),
                }),
              );

              paths.set(s.co, path);

              if (type !== eat) {
                s.resolvers = s.resolvers.push(s.resolver.branch());
              }

              returnValue = defer;
              break;
            }

            case sym.token: {
              const { type, props = {} } = matchable.value;
              const { property = null, value } = props; // more deopt risk

              if (!isType(type)) {
                throw new Error(`${instructionType}.value.type must be a type`);
              }

              if (property != null && !isString(property)) {
                throw new Error(`${instructionType}.value.property must be a string or nullish`);
              }

              let { tokenizer: ts } = s;

              ts.status = active;

              if (instr.type !== eat) {
                ts = ts.branch();
              }

              const range = tokenize(ctx, ts, type, value);

              if (instr.type !== eat) {
                s.tokenizer = range ? ts.accept() : ts.reject();
              }

              returnValue = range;

              prevTokens.set(s.co, s.result);

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

          // do actual matching?

          const startNodeToken = createToken(StartNode, undefined);
          const partialRange = [startNodeToken, null];

          ranges.set(path, partialRange);
          ranges.set(startNodeToken, partialRange);
          prevTokens.set(startNodeToken, s.result);
          paths.set(startNodeToken, path);

          if (instr.type !== match) {
            s.path = path;
            s.resolvers = s.resolvers.push(Resolver.from(s.node));
            s.tokenizer.result = startNodeToken;
          }

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

          if (instr.type !== match) {
            s.path = path.parent;
            s.resolvers = s.resolvers.pop();
            s.tokenizer.result = endNodeToken;
          }

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

      if (returnValue === none) {
        throw new Error('cst-tokens: unanticipated case: returnValue is none');
      } else if (s.status === rejected) {
        break;
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
