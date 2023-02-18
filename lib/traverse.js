import { get, isString, isType } from './utils/object.js';
import { formatType } from './utils/format.js';
import { facades } from './utils/facades.js';
import { createToken } from './utils/token.js';
import { Coroutine } from './coroutine.js';
import { State } from './traverse.state.js';
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

const pathsByCoroutine = new WeakMap();

export const buildContext = (language) => ({
  syntaxGrammar: language.grammars.syntax,
  tokenGrammar: language.grammars.token,
  prevTokensByToken: new WeakMap(),
  ranges: new WeakMap(), // actual ranges: all outer trivia omitted
});

export const traverse = (language, node, source) => {
  const context = buildContext(language);
  const path = Path.from(context, Fragment, node);
  const source_ = Source.from(source);
  const rootState = State.from(path, source_);

  const result = __traverse(context, rootState);

  if (!source.done) {
    throw new Error('Traversal did not fully consume source.');
  }

  source.release();

  return result;
};

export const traverseFragment = (language, node, source) => {
  const context = buildContext(language);
  const path = Path.from(context, Fragment, node);
  const rootState = State.from(path, source);

  return __traverse(context, rootState);
};

function __traverse(context, s) {
  const { syntaxGrammar: grammar, ranges, prevTokensByToken } = context;
  let debug_ = false;
  const getState = () => facades.get(s);

  if (!grammar.aliases.has('Node')) {
    throw new Error('A Node alias is required');
  }

  s.coroutines = s.coroutines.push(
    Coroutine.from(grammar, s.node.type, { path: s.path, getState }),
  );

  pathsByCoroutine.set(s.co, s.path);

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

              pathsByCoroutine.set(s.co, path);
              ranges.set(s.co, [s.result, null]);

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

                  const path = pathsByCoroutine.get(s.co);

                  if (!grammar.has(path.node.type) && !grammar.aliases.has(path.type)) {
                    console.error(instr);
                    throw new Error('startNodeInstruction.type was not a valid type');
                  }

                  const startNodeToken = createToken('StartNode', undefined);
                  const partialRange = [startNodeToken, null];

                  prevTokensByToken.set(startNodeToken, s.result);

                  ranges.set(path, partialRange);
                  ranges.set(startNodeToken, partialRange);

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

                  if (prevTokensByToken.get(endNodeToken) === startNodeToken) {
                    throw new Error('node must not match an empty range');
                  }

                  prevTokensByToken.set(endNodeToken, s.result);

                  ranges.set(path, range);
                  ranges.set(startNodeToken, range);
                  ranges.set(endNodeToken, range);

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
                  debugger;
                  let tokenizerState = s.tokenizer;

                  tokenizerState = tokenize(context, tokenizerState, type, value);

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
        throw new Error('cst-tokens: unanticipated case: returnValue is none');
      } else if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!s.co.done) {
        s.co.advance(returnValue);
      }
    }

    let result = null;

    const partialRange = ranges.get(s.co);

    ranges.set(s.co, [partialRange[0], s.result]);

    if (s.status !== rejected) {
      const { token } = s.tokenizer.match;

      if (!token) throw new Error('No result: token did not end');

      const finishedCo = s.co;
      const resumingCo = s.coroutines.prev.value;
      const suspendingCommand = resumingCo.value;

      if (suspendingCommand.type === eat) {
        s.coroutines = s.coroutines.pop();
        s.tokenizer.match = null;
      } else {
        s = s.accept();
      }

      result = ranges.get(finishedCo);
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
    }

    s.co.advance(result);
  }
}
