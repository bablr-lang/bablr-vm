class Peekerator {
  constructor(iterable) {
    this.iter = iterable[Symbol.iterator]();
    this.current = this.iter.next();
  }

  advance() {
    if (!this.current.done) {
      this.current = this.iter.next();
    }
    return this;
  }
}

module.exports = { Peekerator };
