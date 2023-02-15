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
  startNode,
  endNode,
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

export const matchFragment = (language, node, source) => {
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
          if (instr.type !== eat) {
            s = s.branch();
          }

          const edible = instr.value;

          switch (edible.type) {
            case sym.production: {
              const { type, property = null, props } = edible.value;
              const isMeta = grammar.is('Node', type);

              let { path } = s;

              if (!isMeta) {
                const resolvedProperty = s.resolver.consume(property);
                const child = get(s.node, resolvedProperty);

                if (!child) {
                  throw new Error(`failed to resolve ref\`${property}\``);
                }

                if (!grammar.is(type, child.type)) {
                  returnValue = null;
                  break;
                }

                path = Path.from(grammar, type, child, path, resolvedProperty);
              }

              s.coroutines = s.coroutines.push(
                Coroutine.from(grammar, type, {
                  ...props,
                  path,
                  getState,
                }),
              );

              pathsByCoroutine.set(s.co, path);

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

              if (type === EOF) {
                returnValue = s.tokenizer.done ? createToken(EOF) : null;
                break;
              }

              const tokenizerState = tokenize(context, s.tokenizer, type, value);

              const result = tokenizerState.match.token || null;

              if (result) {
                if (instr.type !== match) {
                  s.tokenizer.accept(tokenizerState);
                }
              } else {
                if (instr.type === eat) {
                  s.reject();
                }
              }

              returnValue = result;
              break;
            }
            default:
              throw new Error('edible.type must be production or terminal');
          }
          break;
        }

        case startNode: {
          if (instr.value !== undefined) {
            throw new Error();
          }

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
          const prevToken = s.result;

          s.path = path;
          s.resolvers = s.resolvers.push(Resolver.from(s.node));
          s.result = startNodeToken;

          prevTokensByToken.set(startNodeToken, prevToken);
          ranges.set(path, partialRange);

          returnValue = path;
          break;
        }

        case endNode: {
          if (instr.value !== undefined) {
            throw new Error();
          }

          if (this.lexicalContext !== 'Bare') {
            throw new Error('Cannot end a node outside the Bare lexical context');
          }

          const path = s.path;
          const partialRange = ranges.get(path);

          if (!partialRange?.[0]) {
            throw new Error('Cannot endNode, it has not started.');
          }

          if (partialRange[1] != null) {
            throw new Error('Cannot endNode, it has already ended.');
          }

          const startNodeToken = partialRange[0];
          const endNodeToken = { type: 'EndNode', value: undefined };
          const range = [startNodeToken, endNodeToken];

          s.path = path.parent;
          s.resolvers = s.resolvers.pop();
          s.result = endNodeToken;

          ranges.set(startNodeToken, range);
          ranges.set(endNodeToken, range);
          ranges.set(path, range);

          returnValue = path;
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
      } else if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!s.co.done) {
        if (s.status === rejected) {
          break;
        } else {
          s.co.advance(returnValue);
        }
      }
    }

    let result = null;

    if (s.status !== rejected) {
      const { token } = s.match;

      if (!token) throw new Error('No result: token did not end');

      const resumingCoroutine = s.coroutines.prev.value;
      const suspendingCommand = resumingCoroutine.value;

      if (suspendingCommand.type === eat) {
        s.coroutines = s.coroutines.pop();
        s.match = null;
      } else {
        s = s.accept();
      }

      result = range;
    } else {
      const finishedCo = s.co;
      s = s.parent;
      while (s.co === finishedCo) {
        s = s.reject();
      }
    }

    s.co.advance(result);
  }
}
