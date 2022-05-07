const { peekerate } = require('iter-tools-es');
const { MinimalBuilder } = require('./minimal.js');

class TokensBuilder extends MinimalBuilder {
  constructor(node, options) {
    super(node, options);
    this.tokenPeekr = peekerate(node.tokens);
    this.fallback = false;
  }

  *advance(token, optional = false) {
    let { tokenPeekr: peekr } = this;
    if (this.fallback) {
      yield* super.advance(token, optional);
      return;
    }

    if (!peekr.done && token.matchToken(peekr.value)) {
      const { value } = peekr;
      peekr.advance();
      yield value;
    } else if (!optional) {
      this.fallback = true;
      yield super.advance(token, optional);
    }
  }
}

module.exports = { TokensBuilder };
