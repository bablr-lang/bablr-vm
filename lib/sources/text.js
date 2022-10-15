const debug = require('debug')('cst-tokens:src');
const { exec: exec_ } = require('@iter-tools/regex');
const { _, _actual } = require('../symbols.js');

class TextSourceFacade {
  constructor(source, writable = true) {
    this[_] = { source, writable };
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

  get type() {
    return 'TextSource';
  }

  get node() {
    return null;
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
    const result = exec_(pattern, this.peekChrs())[0] || null;

    if (result) {
      for (let i = 0; i < result.length; i++) {
        this[_actual].advanceChr(this.node);
      }
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

  branch() {
    return new TextSourceFacade(this[_].source, false);
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

  branch(silent = false) {
    if (!silent) debug(`branch (at sourceText[${this.index}])`);

    return new TextSource(this.sourceText, this.index);
  }

  accept(source) {
    source.end = source.index;
    this.index = source.index;

    debug(`accept (at sourceText[${this.index}])`);

    return this;
  }

  reject() {
    debug('reject');
  }

  advanceChr() {
    this.index++;
  }
}

module.exports = { TextSource, TextSourceFacade };
