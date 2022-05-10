const { peekerate } = require('iter-tools-es');
const { Source } = require('./base.js');

class NodeTokensSource extends Source {
  constructor(node, options) {
    super(node, options);
    this.tokenPeekr = peekerate(node.tokens);
    this.fallback = false;
  }

  *advance(token, optional = false) {
    let { tokenPeekr: peekr } = this;
    if (this.fallback) {
      if (!optional) yield token.build();
    } else if (!peekr.done && token.matchToken(peekr.value)) {
      const { value } = peekr;
      peekr.advance();
      yield value;
    } else if (!optional) {
      this.fallback = true;
      yield* this.advance(token, optional);
    }
  }
}

module.exports = { NodeTokensSource };
