class TextSource {
  constructor(sourceText, index = 0) {
    this.sourceText = sourceText;
    this.index = index;
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
        const [, end] = matchNodes.get(token).sourceRange;
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

module.exports = { TextSource };
