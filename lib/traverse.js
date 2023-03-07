import { get, isString, isType } from './utils/object.js';
import { formatType } from './utils/format.js';
import { facades } from './utils/facades.js';
import { createToken } from './utils/token.js';
import { Coroutine } from './coroutine.js';
import { State } from './traverse.state.js';
import { finalizeStateStatus } from './utils/status.js';
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
  EOF,
  Fragment,
  eat,
  match,
  eatMatch,
  active,
  accepted,
  rejected,
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
  const getState = () => facades.get(s);

  if (!grammar.aliases.has('Node')) {
    throw new Error('A Node alias is required');
  }

  s.coroutines = s.coroutines.push(
    Coroutine.from(grammar, s.node.type, {
      context: facades.get(context),
      path: facades.get(s.path),
      getState,
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
              if (instr.type !== eat) {
                s = s.branch();
              }

              const { type, props = {} } = matchable.value;
              const { property } = props; // this is a deopt waiting to happen

              let path = s.path;

              if (property) {
                const resolvedProperty = s.resolver.consume(property);
                const child = get(s.node, resolvedProperty);

                if (!child) throw new Error(`failed to resolve prod\`${property}\``);

                if (!grammar.is('Node', child.type)) throw new Error();

                if (!grammar.is(type, child.type)) {
                  s.reject();
                  break;
                }

                path = Path.from(grammar, type, child, path, resolvedProperty);
              } else {
                if (grammar.is('Node', type)) throw new Error(`Expected ${type} not to be a Node`);
              }

              s.coroutines = s.coroutines.push(
                // Unknown production of {type: ImportSpecialSpecifier}
                Coroutine.from(grammar, type, {
                  ...props,
                  context: facades.get(context),
                  path: facades.get(path),
                  getState,
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
              const { type, property = null, value } = matchable.value;

              if (!isType(type)) {
                throw new Error(`${instructionType}.value.type must be a type`);
              }

              if (property != null && !isString(property)) {
                throw new Error(`${instructionType}.value.property must be a string or nullish`);
              }

              switch (type) {
                case StartNode: {
                  // if (instr.value !== undefined) {
                  //   throw new Error();
                  // }

                  const path = paths.get(s.co);

                  if (!grammar.has(path.node.type) && !grammar.aliases.has(path.type)) {
                    throw new Error('startNodeInstruction.type was not a valid type');
                  }

                  const startNodeToken = createToken('StartNode', undefined);
                  const partialRange = [startNodeToken, null];

                  prevTokens.set(startNodeToken, s.result);

                  ranges.set(path, partialRange);
                  ranges.set(startNodeToken, partialRange);

                  paths.set(startNodeToken, path);

                  s.path = path;
                  s.resolvers = s.resolvers.push(Resolver.from(s.node));
                  s.result = startNodeToken;

                  returnValue = [startNodeToken, null];
                  break;
                }

                case EndNode: {
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
                  const endNodeToken = { type: 'EndNode', value: undefined };
                  const range = [startNodeToken, endNodeToken];

                  if (prevTokens.get(endNodeToken) === startNodeToken) {
                    throw new Error('node must not match an empty range');
                  }

                  prevTokens.set(endNodeToken, s.result);

                  ranges.set(path, range);
                  ranges.set(startNodeToken, range);
                  ranges.set(endNodeToken, range);

                  paths.set(endNodeToken, path);

                  s.path = path.parent;
                  s.resolvers = s.resolvers.pop();
                  s.result = endNodeToken;

                  returnValue = [startNodeToken, endNodeToken];
                  break;
                }

                case EOF: {
                  const token = createToken(EOF);
                  returnValue = s.tokenizer.done ? [token, token] : null;
                  break;
                }

                default: {
                  const range = tokenize(ctx, s.tokenizer, type, value);

                  if (range) {
                    if (instr.type !== match) {
                      // ??
                    }
                  } else {
                    if (instr.type === eat) {
                      s.reject();
                    }
                  }

                  returnValue = range;
                  break;
                }
              }

              prevTokens.set(s.co, s.result);

              break;
            }

            default:
              throw new Error('matchable.type must be sym.node or sym.token');
          }
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

      if (s.status !== active) {
        break;
      }

      if (returnValue === none) {
        throw new Error('unanticipated case: returnValue is none');
      } else if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!s.co.done) {
        s.co.advance(returnValue);
      }
    }

    finalizeStateStatus(s);

    let result;

    const resumingCoroutine = s.coroutines.prev?.value;

    if (resumingCoroutine) {
      const suspendingCommand = resumingCoroutine.value;

      if (s.status === accepted) {
        const prevToken = prevTokens.get(s.co);
        const finalToken = s.result;
        const range = ctx.getRangeFromPreviousAndFinal(prevToken, finalToken);

        ranges.set(s.co, range);

        if (suspendingCommand.type === eat) {
          s.coroutines = s.coroutines.pop();
          s.status = active;
        } else {
          s = s.accept();
        }

        result = range;
      } else if (s.status === rejected) {
        const finishedCo = s.co;

        let caught = true;
        try {
          finishedCo.throw('cleanup');
        } catch (e) {
          caught = false;
        }
        if (!caught && !finishedCo.done) {
          throw new Error('Generator attempted to yield a command after failing');
        }

        if (suspendingCommand.type !== eat) {
          s = s.parent;
        } else {
          s.coroutines = s.coroutines.pop();
          s.match = null;
        }

        result = null;
      } else {
        throw new Error();
      }

      if (s.status === active) {
        s.co.advance(result);
      }
    } else {
      break;
    }
  }
}
