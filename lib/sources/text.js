import { exec as exec_ } from '@iter-tools/regex';

import { freezeSeal } from '../utils/object.js';
import { debugSrc } from '../debug.js';
import { _actual, _chrs } from '../symbols.js';
import { facades } from '../facades.js';

export class TextSourceFacade {
  constructor(actual) {
    this[_actual] = actual;

    freezeSeal(this);
  }

  static from(sourceText) {
    return new TextSourceFacade(new TextSource(sourceText));
  }

  get type() {
    return this[_actual].type;
  }

  get index() {
    return this[_actual].index;
  }

  get done() {
    return this[_actual].done;
  }

  get value() {
    return this[_actual].value;
  }

  get token() {
    return null;
  }

  peekTokens() {
    return null;
  }

  *peekChrs() {
    let source = this[_actual];

    while (!source.done) {
      yield source.value;
      source = source === this[_actual] ? source.branch(true) : source;
      source.advanceChr(this.node);
    }
  }

  branch() {
    return new TextSourceFacade(this[_actual].branch());
  }

  accept(source) {
    this[_actual].accept(source[_actual]);

    return this;
  }

  reject() {
    this[_actual].reject();
  }

  toString() {
    const { index, end } = this[_actual];
    return end != null ? `sourceText[${index}, ${end}]` : `sourceText[${index}]`;
  }
}

export class TextSource {
  constructor(sourceText, index = 0) {
    this.sourceText = sourceText;
    this.index = index;
    this.start = index;
    this.end = undefined;

    facades.set(this, new TextSourceFacade(this));
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

  *[_chrs]() {
    while (!this.done) {
      yield this.value;
      this.advanceChr();
    }
  }

  exec(pattern) {
    const { index } = this;
    const result = exec_(pattern, this[_chrs]())[0] || null;

    // Backtracking the input allows us to avoid having to fork before executing
    // We give back tokens the regex engine consumed but did not match
    while (this.index > index + (result ? result.length : 0)) {
      this.advanceChr(true);
    }

    return result;
  }

  testExec(pattern) {
    const { index } = this;
    const result = exec_(pattern, this[_chrs]())[0] || null;

    // Backtracking the input allows us to avoid having to fork before executing
    // We give back tokens the regex engine consumed but did not match
    while (this.index > index) {
      this.advanceChr(true);
    }

    return result;
  }

  branch(lookahead = false) {
    if (!lookahead && debugSrc.enabled) debugSrc(`      branch (at sourceText[${this.index}])`);

    return new TextSource(this.sourceText, this.index);
  }

  accept(source) {
    source.end = source.index;
    this.index = source.index;

    if (debugSrc.enabled) debugSrc(`      accept (at sourceText[${this.index}])`);

    return this;
  }

  reject() {
    if (debugSrc.enabled) debugSrc(`      reject (at sourceText[${this.index}])`);
  }

  advanceChr(backwards = false) {
    const increment = backwards ? -1 : 1;

    this.index += increment;
  }
}
