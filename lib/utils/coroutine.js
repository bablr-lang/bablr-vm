class CoroutinePeekerator {
  static from(iterable, ...args) {
    const generator = iterable[Symbol.iterator]();
    const first = generator.next();
    return new this(generator, first, ...args);
  }

  constructor(generator, first) {
    this.generator = generator;
    this.current = first;
  }

  get value() {
    return this.current.value;
  }

  get done() {
    return this.current.done;
  }

  advance(value) {
    if (!this.current.done) {
      this.current = this.generator.next(value);
    }
    return this;
  }

  return() {
    if (!this.done) this.generator.return();
    this.current = { value: undefined, done: true };
    return this;
  }
}

module.exports = { CoroutinePeekerator };
