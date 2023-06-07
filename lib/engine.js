import { WeakStackFrame } from './utils/object.js';
import { Coroutine } from './coroutine.js';

export class Engine extends WeakStackFrame {
  static from(type, matcher, context, state) {
    return new Engine(type, matcher, context, state, new Coroutine(generator));
  }

  constructor(type, matcher, context, state, coroutine) {
    super();

    this.type = type;
    this.matcher = matcher;
    this.context = context;
    this.state = state;
    this.coroutine = coroutine;

    this.match = null;
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

  exec(instr) {}
}
