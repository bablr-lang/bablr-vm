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

function* empty() {}

function* splitWhen(condition, iter) {
  const co = new Coroutine(iter);

  function* part() {
    if (!co.done && condition(co.value)) {
      co.advance();
    }
    while (!co.done && !condition(co.value)) {
      yield co.value;
      co.advance();
    }
  }

  if (!co.done && condition(co.value)) {
    yield empty();
  }

  do {
    yield part();
  } while (!co.done);
}

module.exports = { Coroutine, empty, splitWhen };
