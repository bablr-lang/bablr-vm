class Coroutine {
  constructor(generator) {
    this.generator = generator;
    this.current = generator.next();
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
}

module.exports = { Coroutine };
