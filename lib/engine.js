import { WeakStackFrame } from './utils/object.js';
import { Coroutine } from './coroutine.js';

export class Engine extends WeakStackFrame {
  static from(context, grammar, match, generator) {
    return new Engine(context, grammar, match, new Coroutine(generator));
  }

  constructor(context, grammar, match, coroutine) {
    super();

    this.context = context;
    this.grammar = grammar;
    this.match = match;
    this.coroutine = coroutine;
  }

  get stack() {
    return this.context.engines;
  }

  get ctx() {
    return this.context;
  }

  get co() {
    return this.coroutine;
  }
}
