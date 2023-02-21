import { _actual, EndNode } from './symbols.js';

import { freezeSeal } from './utils/object.js';
import { facades } from './utils/facades.js';

export class ContextFacade {
  constructor(actual) {
    this[_actual] = actual;

    freezeSeal(this);
  }

  getPreviousToken(token) {
    return this[_actual].prevTokens.get(token);
  }
}

export class Context {
  static from(language) {
    const context = new Context(language);
    const facade = new ContextFacade(context);

    facades.set(context, facade);

    return context;
  }

  constructor(language) {
    this.syntaxGrammar = language.grammars.syntax;
    this.tokenGrammar = language.grammars.token;

    this.prevTokens = new WeakMap();
    this.ranges = new WeakMap(); // actual ranges: all outer trivia omitted
    this.paths = new WeakMap();
    this.precedingTokens = new WeakMap();
  }

  getRangeFromPrecedingAndFinal(precedingToken, finalToken) {
    const { prevTokens, paths } = this;

    let token;
    let nextToken = finalToken;

    for (prevTokens.get(finalToken); token !== precedingToken; token = prevTokens.get(token)) {
      if (token.type === EndNode) {
        const path = paths.get(token);
        token = prevTokens.get(path.range[0]);
      }

      nextToken = token;
    }

    // The next token after the preceding token will be the initial token
    const initialToken = nextToken;

    return [initialToken, finalToken];
  }
}
