import { formatType } from './utils/format.js';

export class Coroutine {
  static from(grammar, type, props) {
    const production = grammar.get(type);

    if (!production) throw new Error(`Unknown production of {type: ${formatType(type)}}`);

    return new Coroutine(production(props));
  }

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
