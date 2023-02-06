import regexEscape from 'escape-string-regexp';
import { parse as parseRegex, exec } from '@iter-tools/regex';

import { get, isString, isType } from './utils/object.js';
import { indent, formatType, formatIndex } from './utils/format.js';
import { facades } from './utils/facades.js';
import { createToken } from './utils/token.js';
import { Coroutine } from './utils/grammar.js';
import { State } from './state.js';
import { Path } from './path.js';
import { Source } from './source.js';
import { Resolver } from './resolver.js';
import { debugGrammar, debugDesc, debugTree, debugTokenizer } from './debug.js';
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
  rejected,
  startNode,
  endNode,
  startToken,
  endToken,
  pushLexicalContext,
  popLexicalContext,
} from './symbols.js';

const pathsByCoroutine = new WeakMap();

export const buildContext = (language) => ({
  syntaxGrammar: language.grammars.syntax,
  tokenGrammar: language.grammars.token,
  prevTokensByToken: new WeakMap(),
  pathRangesByToken: new WeakMap(), // actual ranges: all outer trivia omitted
});

export const grammarFor = (context, mode) => {
  switch (mode) {
    case sym.token:
      return context.syntaxGrammar;
    case sym.character:
      return context.tokenGrammar;
  }
};

export const traverse = (language, node, source) => {
  const context = buildContext(language);
  const path = Path.from(context, Fragment, node);
  const source_ = Source.from(source);
  const rootState = new State(context, path, source_);

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
  const rootState = new State(context, path, source);

  return __traverse(context, rootState);
};

export const __traverse = (context, rootState) => {
  const { syntaxGrammar, tokenGrammar, pathRangesByToken, prevTokensByToken } = context;
  let debug_ = false;
  let s = rootState;
  const getState = () => facades.get(s);

  if (!syntaxGrammar.aliases.has('Node')) {
    throw new Error('A node alias is required');
  }

  s.coroutines = s.coroutines.push(
    Coroutine.from(syntaxGrammar, s.node.type, { path: s.path, getState }),
  );

  pathsByCoroutine.set(s.co, s.path);

  for (;;) {
    while (!s.co.done) {
      // The production generator has just yielded an instruction
      const { value: instr } = s.co;
      const { error: cause } = instr;

      const instructionType = formatType(instr.type).replace(/^\[(.*)\]$/, '$1');
      let returnValue = none;

      if (instr.mode !== sym.production && instr.mode !== s.mode && instr.type !== 'debug') {
        throw new Error(
          'Unexpected mode. This is likely an error in a grammar (not the cst-tokens core)',
        );
      }

      if (debug_) {
        debug_ = false;
        debugger;
      }

      switch (instr.type) {
        case match:
        case eatMatch:
        case eat: {
          switch (instr.mode) {
            case sym.production: {
              const { type, property = null, props } = instr.value;
              const grammar = grammarFor(context, s.mode);
              const isMeta = syntaxGrammar.is(s.mode === sym.token ? 'Node' : 'Token', type);

              let child;
              let resolvedProperty;

              if (!isString(property)) {
                throw new Error('startNodeInstruction.property was not a string');
              }

              resolvedProperty = s.resolver.consume(property);
              child = get(s.node, resolvedProperty);

              if (!child) {
                throw new Error(`failed to resolve ref\`${property}\``);
              }

              if (syntaxGrammar.is(type, child.type)) {
                const path = Path.from(syntaxGrammar, type, child, s.path, resolvedProperty);

                s.coroutines = s.coroutines.push(
                  Coroutine.from(grammar, type, {
                    ...props,
                    path,
                    getState,
                  }),
                );

                pathsByCoroutine.set(s.co, path);

                if (debugGrammar.enabled) {
                  debugGrammar(indent(s, `      --> ${formatType(type)}`));
                }

                if (type !== eat) {
                  s = s.branch(); // nested state
                  s.resolvers = s.resolvers.push(s.resolver.branch());
                }

                returnValue = defer;
              } else {
                if (instr.type === eat) {
                  throw new Error();
                } else {
                  returnValue = null;
                }
              }
              break;
            }

            case sym.token: {
              const { type, property = null, value } = instr.value;

              if (!isType(type)) {
                throw new Error(`${instructionType}.value.type must be a type`);
              }

              if (property != null && !isString(property)) {
                throw new Error(`${instructionType}.value.property must be a string or nullish`);
              }

              if (type === EOF) {
                returnValue = s.source.done ? createToken(EOF) : null;
                break;
              }

              const { lexicalContext } = s;
              const props = { getState, lexicalContext, value };

              s.mode = sym.character;
              s.coroutines = s.coroutines.push(Coroutine.from(tokenGrammar, type, props));

              returnValue = defer;
              break;
            }

            case sym.character: {
              const source = s.source.branch();
              let pattern = instr.value;

              if (pattern === sym.EOF) {
                returnValue = source.done ? sym.EOF : null;
                break;
              }

              if (typeof pattern === 'string') {
                pattern = new RegExp(regexEscape(pattern), 'y');
              }

              if (!(pattern instanceof RegExp)) {
                throw new Error('Unsupported pattern');
              }

              const flags = pattern.flags.includes('y') ? pattern.flags : pattern.flags + 'y';

              const [result] = exec(parseRegex(pattern.source, flags), source);

              if (instr.type !== sym.match) {
                source.advance(result.length);

                s.matchState.value += result;
              }

              returnValue = result;
              break;
            }

            default:
              throw new Error(`Unexpected {mode: ${formatType(s.mode)}}`);
          }
          break;
        }

        case startToken: {
          if (s.mode !== sym.character) {
            throw new Error();
          }

          const type = instr.value;

          if (!type) {
            throw new Error();
          }

          s.matchState = { type, value: '', done: false };

          if (debugTokenizer.enabled) debugTokenizer(`startToken ${formatType(type)}`);

          returnValue = undefined;
          break;
        }

        case endToken: {
          if (s.mode !== sym.character) {
            throw new Error();
          }

          debugTokenizer('endToken');

          const { type, value } = s.matchState;

          s.matchState.done = true;

          if (!value) {
            throw new Error('Invalid token');
          }

          if (/\r|\n/.test(value) && !/^\r|\r\n|\n$/.test(value)) {
            throw new Error('Invalid LineBreak token');
          }

          const token = createToken(type, value);

          returnValue = token;
          break;
        }

        case startNode: {
          if (!isString(s.source.value)) {
            // assertTokenizerIsOnStartNode();
          }

          if (instr.value !== undefined) {
            throw new Error();
          }

          if (s.mode !== sym.token) {
            throw new Error('startNodeInstruction must be issued in token mode');
          }

          if (s.lexicalContext !== 'Bare') {
            throw new Error('Cannot start a node outside the Bare lexical context');
          }

          s.path = pathsByCoroutine.get(s.co);
          s.resolvers = s.resolvers.push(Resolver.from(s.node));

          if (!syntaxGrammar.has(s.node.type) && !syntaxGrammar.aliases.has(s.path.type)) {
            console.error(instr);
            throw new Error('startNodeInstruction.type was not a valid type');
          }

          if (debugTree.enabled) debugTree(indent(s, `  -> ${formatType(s.path.type)}`));

          const startNodeToken = createToken('StartNode', undefined);
          const partialRange = [startNodeToken, null];

          const prevToken = s.result;

          prevTokensByToken.set(startNodeToken, prevToken);
          pathRangesByToken.set(startNodeToken, partialRange);

          returnValue = s.path;
          break;
        }

        case endNode: {
          if (s.mode !== sym.token) {
            throw new Error();
          }

          if (instr.value !== undefined) {
            throw new Error();
          }

          // assertNodeStarted();
          // assertNodeNotEnded();

          if (this.lexicalContext !== 'Bare') {
            throw new Error('Cannot end a node outside the Bare lexical context');
          }

          const path = s.path;
          const { refToken } = path;
          const partialRange = pathRangesByToken.get(refToken);
          const startNodeToken = partialRange[0];
          const endNodeToken = { type: 'EndNode', value: undefined };

          if (partialRange[1] != null) {
            throw new Error('Cannot endNode, it has already ended!');
          }

          const range = [startNodeToken, endNodeToken];

          pathRangesByToken.set(startNodeToken, range);
          pathRangesByToken.set(endNodeToken, range);

          s.path = path.parent;

          returnValue = path;
          break;
        }

        case pushLexicalContext: {
          if (s.mode !== sym.token) {
            throw new Error();
          }

          const name = instr.value;

          if (!isString(name)) {
            throw new Error(`pushLexicalContextInstruction.value must be a string`);
          }

          s.lexicalContexts = s.lexicalContexts.push(name);

          if (debugDesc.enabled) {
            debugDesc(`pushLexicalContext ${name}`);
          }

          returnValue = undefined;
          break;
        }

        case popLexicalContext: {
          if (s.mode !== sym.token) {
            throw new Error();
          }

          const name = instr.value;

          if (debugDesc.enabled) {
            debugDesc(`popLexicalContext ${s.lexicalContext}`);
          }

          if (!isString(name)) {
            throw new Error(`popLexicalContextInstruction.value must be a string`);
          }

          if (s.lexicalContext !== name) {
            throw new Error(`cannot pop {lexicalContext: ${s.lexicalContext}}: it is not on top`);
          }

          s.lexicalContexts = s.lexicalContexts.pop();

          returnValue = undefined;
          break;
        }

        case 'debug': {
          debug_ = true;

          returnValue = undefined;
          break;
        }

        default:
          throw new Error(
            `Unexpected Instruction of {type: ${formatType(type)}}`,
            cause && { cause },
          );
      }

      if (returnValue === none) {
        throw new Error('cst-tokens: unanticipated case: returnValue is none');
      } else if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!s.co.done) {
        s.co.advance(returnValue);
      }
    }

    s.path.returnValue = s.co.value;

    if (s.mode === sym.character) {
      if (!s.matchState) {
        throw new Error();
      }

      const { type, value, done } = s.matchState;

      const token = done ? createToken(type, value) : null;

      s.mode = sym.token;
      s.coroutines = s.coroutines.pop();

      const cmdType = s.co.value.type;

      if (cmdType !== eat) {
        if (token) {
          s.accept();
        }
      }

      if (debugDesc.enabled) {
        const prefix =
          (cmdType !== eat ? '? ' : '  ') +
          (token ? (cmdType === match ? '[*]' : '[+]') : cmdType === eat ? '[x]' : '[ ]');

        debugDesc(indent(s, `   ${prefix} ${type}`));
      }

      prevTokensByToken.set(token, s.result);

      s.result = token;
      s.matchState = null;

      s.co.advance(token);
    } else if (s.mode === sym.token) {
      if (!isRoot) {
        if (s.isActive) {
          if (debugTree.enabled) debugTree(indent(s, `  <- ${formatType(s.node.type)}`));

          s = s.accept();

          s.co.advance(someRange);
        } else {
          if (!s.parent) {
            return null;
          }

          s = s.parent;

          s.status = rejected;
          if (!s.parent || s.parent.grammar !== s.co) {
            s.co.return(null);
          }

          if (debugTree.enabled) debugTree(indent(s, `  x- ${formatType(s.node.type)}`));

          if (!s.parent?.path) {
            return null;
          }
        }
      } else {
        if (debugGrammar.enabled) {
          const reject = s.status === rejected && instruction.type === eat;
          const arrow = `  ${reject ? 'x--' : '<--'}`;
          debugGrammar(indent(s, arrow));
        }

        if (fragRange && instruction.type !== match) {
          s = s.accept();
        } else if (!fragRange && instruction.type === eat) {
          s.co.return(null);
          s.status = rejected;
        } else {
          s = s.parent;
          s.status = active;
        }

        s.co.advance(fragRange);
      }
    } else {
      throw new Error('unexpected fallthrough');
    }
  }
};
