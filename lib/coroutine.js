import { formatType } from './utils/format.js';

export class Coroutine {
  static from(grammar, type, props) {
    const production = grammar.get(type);

    if (!production) throw new Error(`Unknown production of {type: ${formatType(type)}}`);

    return new Coroutine(production.match(props));
  }

  constructor(generator) {
    this.generator = generator;
  }

  get value() {
    return this.current.value;
  }

  get done() {
    return this.current?.done;
  }

  advance(value) {
    if (this.done) {
      throw new Error('Cannot advance a coroutine that is done');
    }
    this.current = this.generator.next(value);
    return this;
  }

  return(value) {
    if (!this.done) {
      this.current = this.generator.return(value);
    } else {
      return this.current;
    }
  }

  throw(value) {
    if (!this.done) {
      this.current = { value: undefined, done: true };

      let caught = false;
      try {
        this.generator.throw(value);
      } catch (e) {
        caught = true;
      }
      if (!caught) {
        throw new Error('Generator attempted to yield a command after failing');
      }
    } else {
      throw value;
    }
  }

  finalize() {
    // ensures failures can be logged!
    if (!this.done) {
      this.throw('failure');
    }
  }
}
