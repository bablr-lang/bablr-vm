const { noSource } = require('./none.js');

const { isArray } = Array;
const _ = Symbol('private');

function* dropChrs(n, str) {
  for (let i = n; i < str.length; i++) yield str[i];
}

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
    const { node, index, stopIndex } = this[_];
    return stopIndex != Infinity
      ? `${node.type}.cstTokens[${index}, ${stopIndex}]`
      : `${node.type}.cstTokens[${index}]`;
  }
}

class TokensSource {
  constructor(node, index = 0, stopIndex = Infinity, chrOffset = 0) {
    this.node = node;
    this.cstTokens = node.cstTokens;
    this.index = index;
    this.stopIndex = stopIndex;
    this.chrOffset = chrOffset;

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
    return isArray(node.cstTokens)
      ? node === this.node
        ? new TokensSource(node, this.index, this.stopIndex, this.chrOffset)
        : new TokensSource(node)
      : noSource;
  }

  startDescriptor(descriptor) {
    if (this.stopIndex !== Infinity) {
      throw new Error('cannot select tokens because tokens are already selected');
    }
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

    if (stopIndex === index) {
      throw new Error('cannot start a descriptor that would not match');
    }

    this.stopIndex = stopIndex;
    this.chrOffset = 0;
  }

  endDescriptor(result) {
    if (result && this.chrOffset !== 0) {
      throw new Error('Cannot match a partial token');
    }
    this.stopIndex = Infinity;
  }

  accept(source) {
    if (source.node === this.node) {
      this.index = source.index;
      this.stopIndex = source.stopIndex;
      this.chrOffset = source.chrOffset;
    } else {
      this.index++;
    }
    return this;
  }

  fallback() {
    return noSource;
  }

  advanceChrs(length) {
    let consumed = 0;

    while (consumed < length) {
      const token = this.value;
      if (token.type === 'Reference') {
        throw new Error('advanceChrs cannot consume reference tokens');
      }

      if (this.chrOffset + length >= token.value.length) {
        if (this.done || this.index === this.stopIndex) {
          throw new RangeError('source.advanceChrs length out of bounds');
        }

        consumed += token.value.length;
        this.chrOffset = 0;
        this.index++;
      } else {
        consumed += length;
        this.chrOffset += length;
      }
    }
  }

  *chrs() {
    if (this.stopIndex === Infinity) {
      throw new Error('Tokens source cannot match chrs outside descriptor');
    }
    const { index, chrOffset, stopIndex, cstTokens } = this;
    const end = Math.min(stopIndex, cstTokens.length);

    for (let i = index; i < end; i++) {
      const token = cstTokens[i];
      yield* i === index ? dropChrs(chrOffset, token.value) : token.value;
    }
  }
}

module.exports = { TokensSource };
