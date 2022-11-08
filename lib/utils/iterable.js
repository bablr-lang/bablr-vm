class Coroutine {
  constructor(generator) {
    this.generator = generator[Symbol.iterator]();
    this.current = this.generator?.next();
  }

  get value() {
    return this.current.value;
  }

  get done() {
    return this.current.done;
  }

  advance(value) {
    if (this.current.done) {
      throw new Error('Cannot advance a coroutine that is done');
    }
    this.current = this.generator.next(value);
    return this;
  }

  return(value) {
    this.current = this.generator.return(value);
  }
}

module.exports = { Coroutine };
