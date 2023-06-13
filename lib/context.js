import { EndNode } from './symbols.js';

import { WeakStack, objectEntries } from './utils/object.js';
import { facades, actuals } from './utils/facades.js';
import { GrammarFacade } from './grammar.js';
import * as sym from './symbols.js';

export class ContextFacade {
  constructor(context) {
    facades.set(context, this);
  }

  static from(language) {
    return new ContextFacade(Context.from(language));
  }

  getPreviousToken(token) {
    return actuals.get(this).prevTokens.get(token);
  }

  getGrammar(type) {
    return actuals.get(this).grammars.get(type);
  }
}

export class Context {
  static from(language) {
    return new Context(language);
  }

  constructor(language) {
    const grammars = (this.grammars = new Map(objectEntries(language.grammars)));

    const nodeGrammar = grammars.get(sym.node);
    const tokenGrammar = grammars.get(sym.token);

    if (!nodeGrammar.aliases.has('Node')) {
      throw new Error('A Node alias is required');
    }

    if (!tokenGrammar.aliases.has('Token')) {
      throw new Error('A Token alias is required');
    }

    new GrammarFacade(nodeGrammar);
    new GrammarFacade(tokenGrammar);

    this.prevTokens = new WeakMap();
    this.ranges = new WeakMap(); // actual ranges: all outer trivia omitted
    this.pathsMap = new WeakMap();
    this.matchers = new WeakMap();

    this.engines = new WeakStack();
    this.matches = new WeakStack();
    this.states = new WeakStack();
    this.sources = new WeakStack();
    this.paths = new WeakStack();

    new ContextFacade(this);
  }

  getRangeFromMatch(match) {
    const { prevTokens, pathsMap, ranges } = this;
    const { precedingToken, finalToken } = match;

    if (precedingToken === finalToken) {
      return null;
    } else {
      let token;
      let nextToken = finalToken;

      for (
        token = prevTokens.get(finalToken);
        token !== precedingToken;
        token = prevTokens.get(token)
      ) {
        if (token.type === EndNode) {
          const path = pathsMap.get(token);
          token = prevTokens.get(ranges.get(path)[0]);
        }

        nextToken = token;
      }

      // The next token after the preceding token will be the initial token
      const initialToken = nextToken;

      return [initialToken, finalToken];
    }
  }

  *ownTokensFor(range) {
    if (!range) return;

    const { prevTokens, paths, ranges } = this;
    const { 0: start, 1: end } = range;
    const prev = prevTokens.get(start);

    for (let token = end; token !== prev; token = prevTokens.get(token)) {
      if (token.type === EndNode) {
        const path = paths.get(token);
        token = prevTokens.get(ranges.get(path)[0]);
      }

      yield token;
    }
  }

  *allTokensFor(range) {
    if (!range) return;

    const { prevTokens } = this;
    const { 0: start, 1: end } = range;
    const prev = prevTokens.get(start);

    for (let token = end; token !== prev; token = prevTokens.get(token)) {
      yield token;
    }
  }
}
