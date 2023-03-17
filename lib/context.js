import { _actual, EndNode } from './symbols.js';

import { freezeSeal } from './utils/object.js';
import { facades } from './utils/facades.js';
import { GrammarFacade } from './grammar.js';

export class ContextFacade {
  constructor(context) {
    this[_actual] = context;

    freezeSeal(this);
  }

  static from(language) {
    return facades.get(Context.from(language));
  }

  getPreviousToken(token) {
    return this[_actual].prevTokens.get(token);
  }

  get nodeGrammar() {
    return facades.get(this[_actual].nodeGrammar);
  }

  get tokenGrammar() {
    return facades.get(this[_actual].tokenGrammar);
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
    this.nodeGrammar = language.grammars.node;
    this.tokenGrammar = language.grammars.token;

    facades.set(this.nodeGrammar, new GrammarFacade(this.nodeGrammar));
    facades.set(this.tokenGrammar, new GrammarFacade(this.tokenGrammar));

    this.prevTokens = new WeakMap();
    this.ranges = new WeakMap(); // actual ranges: all outer trivia omitted
    this.paths = new WeakMap();
  }

  getRangeFromPreviousAndFinal(previousToken, finalToken) {
    const { prevTokens, paths, ranges } = this;

    if (previousToken === finalToken) {
      return null;
    } else {
      let token;
      let nextToken = finalToken;

      for (
        token = prevTokens.get(finalToken);
        token !== previousToken;
        token = prevTokens.get(token)
      ) {
        if (token.type === EndNode) {
          const path = paths.get(token);
          token = prevTokens.get(ranges.get(path)[0]);
        }

        nextToken = token;
      }

      // The next token after the preceding token will be the initial token
      const initialToken = nextToken;

      return [initialToken, finalToken];
    }
  }
}
