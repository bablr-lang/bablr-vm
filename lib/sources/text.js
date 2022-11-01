const { exec: exec_ } = require('@iter-tools/regex');
const { debugSrc } = require('../debug.js');
const { _, _actual, _chrs } = require('../symbols.js');

class TextSourceFacade {
  constructor(source, node, writable = true) {
    this[_] = { source, node, writable };
  }

  static from(sourceText) {
    return new TextSourceFacade(new TextSource(sourceText));
  }

  get [_actual]() {
    if (!this[_].writable) {
      this[_].writable = true;
      this[_].source = this[_].source.branch();
    }
    return this[_].source;
  }

  *[_chrs]() {
    while (!this.done) {
      yield this.value;
      this[_actual].advanceChr();
    }
  }

  get type() {
    return 'TextSource';
  }

  get node() {
    return this[_].node;
  }

  get index() {
    return this[_].source.index;
  }

  get done() {
    return this[_].source.done;
  }

  get value() {
    return this[_].source.value;
  }

  get token() {
    return null;
  }

  exec(pattern) {
    const { index } = this[_].source;
    const result = exec_(pattern, this[_chrs]())[0] || null;

    // Backtracking the input allows us to avoid having to fork before executing
    // We give back tokens the regex engine consumed but did not match
    while (this.index > index + (result ? result.length : 0)) {
      this[_actual].advanceChr(true);
    }

    return result;
  }

  testExec(pattern) {
    const { index } = this[_].source;
    const result = exec_(pattern, this[_chrs]())[0] || null;

    // Backtracking the input allows us to avoid having to fork before executing
    // We give back tokens the regex engine consumed but did not match
    while (this.index > index) {
      this[_actual].advanceChr(true);
    }

    return result;
  }

  peekTokens() {
    return null;
  }

  *peekChrs() {
    let { source } = this[_];

    while (!source.done) {
      yield source.value;
      source = source === this[_].source ? source.branch(true) : source;
      source.advanceChr(this.node);
    }
  }

  branch(node = this.node) {
    return new TextSourceFacade(this[_].source, node, this.node !== node);
  }

  accept(source) {
    if (source[_].source !== this[_].source) {
      this[_actual].accept(source[_].source);
    }
    return this;
  }

  reject() {
    if (this[_].writable) {
      this[_].source.reject();
    }
  }

  toString() {
    const { index, end } = this[_].source;
    return end != null ? `sourceText[${index}, ${end}]` : `sourceText[${index}]`;
  }
}

class TextSource {
  constructor(sourceText, index = 0) {
    this.sourceText = sourceText;
    this.index = index;
    this.start = index;
    this.end = undefined;
  }

  get done() {
    return this.index >= this.sourceText.length;
  }

  get value() {
    return this.sourceText[this.index];
  }

  branch(lookahead = false) {
    if (!lookahead) debugSrc(`branch (at sourceText[${this.index}])`);

    return new TextSource(this.sourceText, this.index);
  }

  accept(source) {
    source.end = source.index;
    this.index = source.index;

    debugSrc(`accept (at sourceText[${this.index}])`);

    return this;
  }

  reject() {
    debugSrc('reject');
  }

  advanceChr(backwards = false) {
    const increment = backwards ? -1 : 1;

    this.index += increment;
  }
}

module.exports = { TextSource, TextSourceFacade };
