import { get, isString, isType } from './utils/object.js';
import { formatType } from './utils/format.js';
import { facades } from './utils/facades.js';
import { createToken } from './utils/token.js';
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
  EOF,
  Fragment,
  eat,
  match,
  eatMatch,
  rejected,
  StartNode,
  EndNode,
} from './symbols.js';

export const traverse = (language, node, source) => {
  const context = Context.from(language);
  const path = Path.from(context, Fragment, node);
  const source_ = Source.from(source);
  const state = State.from(path, source_);

  const result = __traverse(context, state);

  if (!source.done) {
    throw new Error('Traversal did not fully consume source.');
  }

  source.release();

  return result;
};

export const traverseFragment = (language, node, source) => {
  const context = Context.from(language);
  const path = Path.from(context, Fragment, node);
  const state = State.from(path, source);

  return __traverse(context, state);
};

function __traverse(context, initialState) {
  const ctx = context;
  const { syntaxGrammar: grammar, ranges, prevTokens, paths, precedingTokens } = ctx;
  let debug_ = false;
  let s = initialState;
  const getState = () => facades.get(s);

  if (!grammar.aliases.has('Node')) {
    throw new Error('A Node alias is required');
  }

  s.coroutines = s.coroutines.push(
    Coroutine.from(grammar, s.node.type, { path: s.path, getState }),
  );

  paths.set(s.co, s.path);

  for (;;) {
    while (!s.co.done) {
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
          const edible = instr.value;

          switch (edible.type) {
            case sym.production: {
              if (instr.type !== eat) {
                s = s.branch();
              }

              const { type, property = null, props } = edible.value;

              let path = s.path;

              if (property) {
                const resolvedProperty = s.resolver.consume(property);
                const child = get(s.node, resolvedProperty);

                if (!child) throw new Error(`failed to resolve ref\`${property}\``);

                if (!grammar.is('Node', child.type)) throw new Error();

                if (!grammar.is(type, child.type)) {
                  s.reject();
                  break;
                }

                path = Path.from(grammar, type, child, path, resolvedProperty);
              } else {
                if (grammar.is('Node', type)) throw new Error();
              }

              s.coroutines = s.coroutines.push(
                // Unknown production of {type: ImportSpecialSpecifier}
                Coroutine.from(grammar, type, {
                  ...props,
                  path,
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

            case sym.terminal: {
              const { type, property = null, value } = edible.value;

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

                  if (s.tokenizer.lexicalContext !== 'Bare') {
                    throw new Error('Cannot start a node outside the Bare lexical context');
                  }

                  const path = paths.get(s.co);

                  if (!grammar.has(path.node.type) && !grammar.aliases.has(path.type)) {
                    console.error(instr);
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

                  returnValue = path;
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

                  returnValue = path;
                  break;
                }

                case EOF: {
                  returnValue = s.tokenizer.done ? createToken(EOF) : null;
                  break;
                }

                default: {
                  let tokenizerState = s.tokenizer;

                  tokenizerState = tokenize(ctx, tokenizerState, type, value);

                  const result = tokenizerState.match?.token || null;

                  if (result) {
                    if (instr.type !== match) {
                      s.tokenizer = tokenizerState;
                    }
                  } else {
                    if (instr.type === eat) {
                      s.reject();
                    }
                  }

                  returnValue = result;
                  break;
                }
              }

              precedingTokens.set(s.co, s.result);

              break;
            }

            default:
              throw new Error('edible.type must be production or terminal');
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

      if (s.status === rejected) {
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

    let result;

    if (s.status !== rejected) {
      const resumingCo = s.coroutines.prev.value;
      const suspendingCommand = resumingCo.value;
      const precedingToken = precedingTokens.get(s.co);
      const finalToken = s.result;
      const range = ctx.getRangeFromPrecedingAndFinal(precedingToken, finalToken);

      ranges.set(s.co, range);

      if (suspendingCommand.type === eat) {
        s.coroutines = s.coroutines.pop();
        s.tokenizer.match = null;
      } else {
        s = s.accept();
      }

      result = range;
    } else {
      const finishedCo = s.co;
      s = s.parent;
      while (s.co === finishedCo && s.parent) {
        const resumingCo = s.coroutines.prev.value;
        const suspendingCommand = resumingCo.value;

        if (suspendingCommand.type === eat) {
          s.coroutines = s.coroutines.pop();
        } else {
          s = s.reject();
        }
      }

      if (s.co === finishedCo) {
        throw new Error('parsing failed');
      }

      result = null;
    }

    s.co.advance(result);
  }
}
