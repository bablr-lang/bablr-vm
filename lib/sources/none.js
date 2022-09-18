class NoSourceFacade {
  get type() {
    return 'NoSource';
  }

  toString() {
    return 'generated';
  }
}

class NoSource {
  constructor() {
    this.facade = new NoSourceFacade();
  }

  get type() {
    return 'NoSource';
  }

  get done() {
    throw new Error('get done not implemented');
  }

  get value() {
    throw new Error('get value not implemented');
  }

  branch() {
    return this;
  }

  startDescriptor() {}

  endDescriptor() {}

  accept() {
    return this;
  }

  fallback() {
    throw new Error('Cannot fallback from a fallback');
  }

  advanceChrs(chrs) {
    throw new Error('advanceChrs not implemented');
  }

  chrs() {
    throw new Error('chrs not implemented');
  }
}

const noSource = new NoSource();

module.exports = { NoSource, noSource };
