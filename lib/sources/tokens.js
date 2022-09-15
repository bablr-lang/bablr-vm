const { noSource } = require('./none.js');

const { isArray } = Array;

const _ = Symbol('private');

class TokensSourceFacade {
  constructor(source) {
    this[_] = source;
    if (source.facade) {
      throw new Error('A source can have only one facade');
    }
    source.facade = this;
  }

  get type() {
    return 'TokensSource';
  }

  get node() {
    return this[_].node;
  }

  get index() {
    return this[_].index;
  }

  toString() {
    const { index, stopIndex } = this[_];
    return stopIndex != null
      ? `node.cstTokens[${index}, ${stopIndex}]`
      : `node.cstTokens[${index}]`;
  }
}

class TokensSource {
  constructor(node) {
    this.node = node;
    this.cstTokens = node.cstTokens;
    this.index = 0;
    this.stopIndex = Infinity;

    this.facade = new TokensSourceFacade(this);
  }

  get type() {
    return 'TokensSource';
  }

  get done() {
    return this.index >= this.cstTokens.length;
  }

  get value() {
    return this.cstTokens[this.index];
  }

  branch(node = this.node) {
    return isArray(node.cstTokens) ? new TokensSource(node, this) : noSource;
  }

  selectTokens(descriptor) {
    const { node, index } = this;
    const { cstTokens } = node;
    const { type, mergeable } = descriptor;
    let first = true;
    let stopIndex = index;

    for (let i = index; i < cstTokens.length; i++) {
      const token = cstTokens[i];
      if (token.type !== type || (!first && !mergeable)) {
        break;
      } else {
        stopIndex++;
      }
      first = false;
    }

    this.stopIndex = stopIndex;
  }

  deselectTokens() {
    this.stopIndex = Infinity;
  }

  accept(source) {
    if (source.node === this.node) {
      this.index = source.index;
    } else {
      this.index++;
    }
    return this;
  }

  fallback() {
    return noSource;
  }

  advanceChrs(length) {
    let consumedTokens = 0;
    let consumedChrs = 0;
    while (consumedChrs < length) {
      if (this.value.type === 'Reference') {
        throw new Error('advanceChrs cannot consume reference tokens');
      } else {
        consumedTokens++;
        consumedChrs += this.value.value.length;
      }
    }
    if (consumedChrs > length) {
      throw new Error('Parsing failed: attempted to partially consume a token');
    }
    this.index += consumedTokens;
  }

  *chrs() {
    const { index, stopIndex, cstTokens } = this;
    const end = Math.min(stopIndex, cstTokens.length);

    for (let i = index; i < end; i++) {
      const { type, value } = cstTokens[i];
      if (type === 'Reference') {
        return;
      } else {
        yield* value;
      }
    }
  }
}

module.exports = { TokensSource };
