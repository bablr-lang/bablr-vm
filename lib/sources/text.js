const _ = Symbol('private');

class TextSourceFacade {
  constructor(source) {
    this[_] = source;
    if (source.facade) {
      throw new Error('A source can have only one facade');
    }
    source.facade = this;
  }

  get type() {
    return 'TextSource';
  }

  get index() {
    return this[_].index;
  }

  toString() {
    const { index, end } = this[_];
    return end != null ? `sourceText[${index}, ${end}]` : `sourceText[${index}]`;
  }
}

class TextSource {
  constructor(sourceText, index = 0) {
    this.sourceText = sourceText;
    this.index = index;
    this.start = index;
    this.end = undefined;

    this.facade = new TextSourceFacade(this);
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

  branch() {
    return new TextSource(this.sourceText, this.index);
  }

  startDescriptor() {}

  endDescriptor() {}

  accept(source) {
    source.end = source.index;
    this.index = source.index;
    return this;
  }

  fallback() {
    throw new Error();
  }

  advanceChrs(length) {
    this.index += length;
  }

  *chrs() {
    const { index, sourceText } = this;
    for (let i = index; i < sourceText.length; i++) {
      yield sourceText[i];
    }
  }
}

module.exports = { TextSource };
