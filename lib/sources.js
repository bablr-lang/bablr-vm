const { isArray } = Array;

class TextSource {
  constructor(sourceText, index = 0) {
    this.sourceText = sourceText;
    this.index = index;
  }

  get type() {
    return 'TextSource';
  }

  get done() {
    return this.index >= this.sourceText.length;
  }

  get value() {
    return this.sourceText[this.index];
  }

  fork() {
    return new TextSource(this.sourceText, this.index);
  }

  match(descriptor) {
    return descriptor.type === 'Reference' ? descriptor.build() : descriptor.matchChrs(this);
  }

  advance(tokens, matchNodes) {
    let n = 0;
    for (const token of tokens) {
      if (token.type === 'Reference') {
        const { end } = matchNodes.get(token).source;
        const delta = end - this.index;
        if (delta < 0) throw new Error('oops');
        n += delta;
      } else {
        n += token.value.length;
      }
    }
    this.index += n;
  }

  fallback() {
    throw new Error('Parsing failed');
  }

  *[Symbol.iterator]() {
    const { index, sourceText } = this;
    for (let i = index; i < sourceText.length; i++) {
      yield sourceText[i];
    }
  }
}

class TokensSource {
  constructor(node, index = 0) {
    this.node = node;
    this.index = index;
  }

  get type() {
    return 'TokensSource';
  }

  get done() {
    return this.index >= this.node.tokens.length;
  }

  get value() {
    return this.node.tokens[this.index];
  }

  fork(node = this.node) {
    const reset = node !== this.node;
    return isArray(node.tokens) ? new TokensSource(node, reset ? 0 : this.index) : noSource;
  }

  match(descriptor) {
    return descriptor.matchTokens(this);
  }

  advance(tokens) {
    this.index += tokens.length;
  }

  fallback() {
    return noSource;
  }

  *[Symbol.iterator]() {
    const { index, node } = this;
    for (let i = index; i < node.tokens.length; i++) {
      yield node.tokens[i];
    }
  }
}

class NoSource {
  get type() {
    return 'NoSource';
  }

  get done() {
    throw new Error('not implemented');
  }

  get value() {
    throw new Error('not implemented');
  }

  fork() {
    return this;
  }

  match(descriptor) {
    return descriptor.build();
  }

  advance() {
    // nothing to do
  }

  fallback() {
    throw new Error('Cannot fallback from a fallback');
  }

  [Symbol.iterator]() {
    throw new Error('not implemented');
  }
}

const noSource = new NoSource();

const sourceFor = (node, options = {}) => {
  const { sourceText } = options;
  // prettier-ignore
  return sourceText != null
    ? new TextSource(sourceText)
    : isArray(node.tokens)
      ? new TokensSource(node)
      : noSource;
};

module.exports = { TextSource, TokensSource, NoSource, sourceFor };
