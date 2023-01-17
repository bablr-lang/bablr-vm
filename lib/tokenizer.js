import regexEscape from 'escape-string-regexp';
import { str } from 'iter-tools-es';
import { parse as parseRegex, exec } from '@iter-tools/regex';
import emptyStack from '@iter-tools/imm-stack';
import { freezeSeal, isString } from './utils/object.js';
import { Coroutine } from './production.js';
import { facades } from './utils/facades.js';
import { _actual } from './symbols.js';
import { traverseFragment } from './traverse.js';
import * as sym from './symbols.js';

export class TokenizerFacade {
  constructor(actual) {
    this[_actual] = actual;
  }

  static from(language, path, source) {
    const facade = new TokenizerFacade(new Tokenizer(language, path, source));
    facades.set(this, facade);
    return facade;
  }

  get lexicalContext() {
    return this[_actual].lexicalContext;
  }
}

export class Tokenizer {
  constructor(language, path, source, token = null, lexicalContexts = emptyStack.push('Bare')) {
    this.language = language;
    this.path = path;
    this.source = source; // Iterable<string | Token>
    this.token = token; // result (?)
    this.lexicalContexts = lexicalContexts;

    this.prevTokensByToken = new WeakMap();
    this.pathRangesByToken = new WeakMap(); // actual ranges: all outer trivia omitted
  }

  eatTrivia() {
    const { language, source, lexicalContext } = this;
    const { token: tokenGrammar } = language.grammars;

    if (tokenGrammar.allowsTrivia(lexicalContext)) {
      traverseFragment(language, null, source);
    }
  }

  push(token) {
    const prevToken = this.token;

    freezeSeal(token);

    this.token = token;

    this.prevTokensByToken.set(token, prevToken);

    return token;
  }

  startNode(path) {
    const { lexicalContext, pathRangesByToken } = this;

    if (lexicalContext !== 'Bare') {
      throw new Error('Cannot start a node outside the Bare lexical context');
    }

    const startNodeToken = { type: sym.startNode, value: undefined };
    const partialRange = [startNodeToken, null];

    this.push(startNodeToken);

    pathRangesByToken.set(startNodeToken, partialRange);

    this.path = path;
  }

  endNode(path) {
    const { pathRangesByToken, prevTokensByToken } = this;
    if (this.lexicalContext !== 'Bare') {
      throw new Error('Cannot end a node outside the Bare lexical context');
    }

    if (path !== this.path) throw new Error('source.endNode called with an inactive path');

    const { refToken } = path;
    const partialRange = pathRangesByToken.get(refToken);
    const startNodeToken = partialRange[0];
    const endNodeToken = { type: sym.endNode, value: undefined };

    if (partialRange[1] != null) {
      throw new Error('Cannot endNode, it has already ended!');
    }

    const range = [startNodeToken, endNodeToken];

    pathRangesByToken.set(startNodeToken, range);
    pathRangesByToken.set(endNodeToken, range);

    this.path = path.parent;

    const cstTokens = [];
    let token;

    while (token !== startNodeToken) {
      if (token.type === sym.endRange) {
        const range = pathRangesByToken.get(token);
        cstTokens.push({ ...range.refToken });
        token = range.start;
      } else {
        cstTokens.push({ ...token });
        token = prevTokensByToken.get(token);
      }
    }

    return freezeSeal(cstTokens);
  }

  match(type, value) {
    const { language, lexicalContext } = this;
    const { token: grammar } = language.grammars;
    const production = grammar.get(type);
    const props = { lexicalContext, value };

    const result = this.matchChrs(production(props));

    return { type, result };
  }

  matchChrs(production) {
    const co = new Coroutine(production);

    const source = this.source.branch();

    let debug_ = false;

    let result = emptyStack;

    while (!co.done) {
      const { value: command } = co;
      const { type, value } = command;
      let returnValue = undefined;

      if (debug_) {
        debug_ = false;
        debugger;
      }

      switch (type) {
        case sym.matchChrs:
        case sym.eatMatchChrs:
        case sym.eatChrs: {
          let pattern = value;

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

          if (type !== sym.matchChrs) {
            source.advance(result.length);
          }

          returnValue = result;
          break;
        }

        case sym.pushLexicalContext: {
          const name = value;

          if (!isString(name)) {
            throw new Error(`pushLexicalContextCommand.value must be a string`);
          }

          this.lexicalContexts = this.lexicalContexts.push(name);

          returnValue = undefined;
          break;
        }

        case sym.popLexicalContext: {
          const name = value;

          if (!isString(name)) {
            throw new Error(`popLexicalContextCommand.value must be a string`);
          }

          if (this.lexicalContext !== name) {
            throw new Error(
              `cannot pop {lexicalContext: ${this.lexicalContext}}: it is not on top`,
            );
          }

          this.lexicalContexts = this.lexicalContexts.pop();

          returnValue = undefined;
          break;
        }

        case 'debug': {
          debug_ = true;
          break;
        }

        default:
          throw new Error(`Unexpected command of {type: ${type}} emitted from production`);
      }
      if (!co.done) {
        co.advance(returnValue);
      }
    }

    if (/\r|\n/.test(result) && !/^\r|\r\n|\n$/.test(result)) {
      throw new Error('Invalid LineBreak token');
    }

    return str(result);
  }

  get lexicalContext() {
    return this.lexicalContexts.value;
  }

  branch() {
    const { tokenGrammar, source, path, result, lexicalContexts } = this;

    return new Tokenizer(tokenGrammar, source.branch(), path, result, lexicalContexts);
  }

  accept(tokenizer) {
    const { source, path, result, lexicalContexts } = tokenizer;

    this.source.accept(source);
    this.path = path;
    this.result = result;
    this.lexicalContexts = lexicalContexts;
  }

  reject() {
    this.source.reject();
  }

  formatIndex() {
    return `source[${this.source.index}]`;
  }
}
