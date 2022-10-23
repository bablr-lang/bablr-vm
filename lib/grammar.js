class Coroutine {
  constructor(generator) {
    this.generator = generator;
    this.current = generator?.next();
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

class Grammar extends Coroutine {
  constructor(grammar, context) {
    super(null);
    this.current = null;
    this.grammar = grammar;
    this.context = context;
  }

  init(getState) {
    const { grammar, context } = this;
    const { path } = getState();

    this.generator = grammar(path, context, getState);
    this.current = this.generator.next();
    return this;
  }
}

module.exports = { Coroutine, Grammar };
