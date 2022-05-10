/**
 * Builders are responsible for reusing existing concrete syntax while guaranteeing that emitted
 * tokens represent valid syntax.
 */
class Source {
  constructor(node, options) {
    this.node = node;
    this.options = options;
  }

  *ensure(...tokens) {
    for (const token of tokens) {
      yield* token.type === 'Thunk' ? token.ensure(this) : this.advance(token);
    }
  }

  *allow(...tokens) {
    for (const token of tokens) {
      yield* token.type === 'Thunk' ? token.allow(this) : this.advance(token, true);
    }
  }

  advance() {
    throw new Error('Not implemented');
  }
}

module.exports = { Source };
