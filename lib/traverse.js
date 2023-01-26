import regexEscape from 'escape-string-regexp';
import { parse as parseRegex, exec } from '@iter-tools/regex';

import { get, isString, isType, freezeSeal } from './utils/object.js';
import { indent, formatType, formatIndex } from './utils/format.js';
import { facades } from './utils/facades.js';
import { createToken } from './utils/token.js';
import { Coroutine } from './utils/grammar.js';
import { State } from './state.js';
import { Path } from './path.js';
import { Source } from './source.js';
import { debug, debugDesc, debugTree } from './debug.js';
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
  const rootState = State.from(context, path, source_);

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
  const rootState = State.from(context, path, source);

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

  s.coroutines = s.coroutines.push(Coroutine.from(syntaxGrammar, s.node.type, { getState }));
  s.coroutines = s.coroutines.push(Coroutine.from(tokenGrammar, 'Separator', { getState }));

  for (;;) {
    while (!s.co.done) {
      // The production generator has just yielded a command
      const { value: cmd } = s.co;
      const { error: cause } = cmd;

      const commandType = formatType(cmd.type).replace(/^\[(.*)\]$/, '$1');
      let returnValue = none;

      if (cmd.mode !== sym.production && cmd.mode !== s.mode) {
        throw new Error(
          'Unexpected mode. This is likely an error in a grammar (not the cst-tokens core)',
        );
      }

      if (debug_) {
        debug_ = false;
        debugger;
      }

      switch (cmd.type) {
        case match:
        case eatMatch:
        case eat: {
          switch (cmd.mode) {
            case sym.production: {
              const { type, property = null, props } = cmd.value;
              const grammar = grammarFor(context, s.mode);
              const production = Coroutine.from(grammar, type, { ...props, getState });

              if (debug.enabled && syntaxGrammar.is('Node', type)) {
                debug(indent(s, `          --> ${formatType(type)}`), type);
              }

              s = s.branch(); // nested state
              s.coroutines = s.coroutines.push(production);

              if (type !== eat) {
                s.resolver = s.resolver.branch();
              }

              returnValue = defer;
              break;
            }

            case sym.token: {
              const { type, property = null, value } = cmd.value;

              if (!isType(type)) {
                throw new Error(`${commandType}.value.type must be a type`);
              }

              if (property != null && !isString(property)) {
                throw new Error(`${commandType}.value.property must be a string or nullish`);
              }

              if (type === EOF) {
                returnValue = s.source.done ? { type: EOF, value: undefined } : null;
                break;
              }

              const production = tokenGrammar.get(type);
              const { lexicalContext } = s;
              const props = { lexicalContext, value };

              const chrs = this.matchChrs(production(props));

              const result = { type, result: chrs };

              if (debugDesc.enabled) {
                const prefix =
                  (type !== eat ? '? ' : '  ') +
                  (result ? (type === match ? '[*]' : '[+]') : type === eat ? '[x]' : '[ ]');

                debugDesc(indent(s, `   ${prefix} ${type}`));
              }

              let token = null;

              if (result) {
                token = createToken(type, result);
              } else {
                if (type === eat) {
                  s.status = rejected;
                  s.co.return(null);
                }
              }

              returnValue = token;
              break;
            }

            case sym.character: {
              const source = s.source.branch();
              let pattern = cmd.value;

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

              const result = exec(parseRegex(pattern.source, flags), source);

              if (cmd.type !== sym.match) {
                source.advance(result.length);
              }

              returnValue = result;
              break;
            }

            default:
              throw new Error(`Unexpected {mode: ${formatType(s.mode)}}`);
          }
        }

        case startToken: {
          if (s.mode === sym.character) {
            throw new Error();
          }

          const type = cmd.value;
          if (!type) {
            throw new Error();
          }

          s.mode = sym.character;
          s.coroutines = s.coroutines.push(Coroutine.from(tokenGrammar, type, { getState }));

          returnValue = undefined;
          break;
        }

        case endToken: {
          if (s.mode !== sym.character) {
            throw new Error();
          }

          s.mode = sym.token;
          s.coroutines = s.coroutines.pop();
          s.coroutines = s.coroutines.push(Coroutine.from(tokenGrammar, 'Separator', { getState }));

          const value = result;
          const type = fixme;

          if (/\r|\n/.test(value) && !/^\r|\r\n|\n$/.test(value)) {
            throw new Error('Invalid LineBreak token');
          }

          const token = freezeSeal({ type, value });

          returnValue = token;
          break;
        }

        case startNode: {
          if (s.mode !== sym.token) {
            throw new Error();
          }

          if (!isString(s.source.value)) {
            assertTokenizerIsOnStartNode();
          }

          if (lexicalContext !== 'Bare') {
            throw new Error('Cannot start a node outside the Bare lexical context');
          }

          const { property, type } = cmd.value;

          if (!isString(property)) {
            throw new Error('startNodeCommand.property was not a string');
          }

          if (!syntaxGrammar.has(type) && !syntaxGrammar.aliases.has(type)) {
            throw new Error('startNodeCommand.type was not a valid type');
          }

          const resolvedProperty = s.resolver.consume(property);

          const child = get(s.node, resolvedProperty);

          if (!child) {
            throw new Error(`failed to resolve ref\`${property}\``);
          }

          s.path = Path.from(syntaxGrammar, child, type, s.path.node, resolvedProperty);

          if (debugTree.enabled) debugTree(indent(s, `  -> ${formatType(child.type)}`));

          const { lexicalContext, pathRangesByToken } = this;

          const startNodeToken = { type: 'StartNode', value: undefined };
          const partialRange = [startNodeToken, null];

          this.push(startNodeToken);

          pathRangesByToken.set(startNodeToken, partialRange);

          this.path = path;

          return partialRange;

          returnValue = s.path;
          break;
        }

        case endNode: {
          if (s.mode !== sym.token) {
            throw new Error();
          }

          assertNodeStarted();
          assertNodeNotEnded();

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
          if (s.mode !== sym.character) {
            throw new Error();
          }

          const name = cmd.value;

          if (!isString(name)) {
            throw new Error(`pushLexicalContextCommand.value must be a string`);
          }

          s.lexicalContexts = s.lexicalContexts.push(name);

          returnValue = undefined;
          break;
        }

        case popLexicalContext: {
          if (s.mode !== sym.character) {
            throw new Error();
          }

          const name = cmd.value;

          if (!isString(name)) {
            throw new Error(`popLexicalContextCommand.value must be a string`);
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
          throw new Error(`Unexpected command of {type: ${formatType(type)}}`, cause && { cause });
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

    if (!s.isRoot) {
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
      if (debug.enabled) {
        const reject = s.status === rejected && command.type === eat;
        const arrow = `      ${reject ? 'x--' : '<--'}`;
        debug(indent(s, arrow));
      }

      if (fragRange && command.type !== match) {
        s = s.accept();
      } else if (!fragRange && command.type === eat) {
        s.co.return(null);
        s.status = rejected;
      } else {
        s = s.parent;
        s.status = active;
      }

      s.co.advance(fragRange);
    }
  }
};
