import { _actual, EndNode } from './symbols.js';

export class Context {
  static from(language) {
    return new Context(language);
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
