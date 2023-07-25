import { WeakStackFrame } from '../utils/object.js';
import { facades } from '../utils/facades.js';

export class StateFacade {
  constructor(state) {
    facades.set(state, this);
  }
}

export class DispatcherState extends WeakStackFrame {
  constructor(context, states) {
    super();

    this.context = context;
    this.states = states;

    new StateFacade(this);
  }

  static from(context, states) {
    const state = new DispatcherState(context, states);

    return state.stack.push(null, state);
  }

  get stack() {
    return this.context.states;
  }

  get(grammar) {
    return this.states.get(grammar);
  }

  branch() {
    const { context, states } = this;

    return this.push(new DispatcherState(context, states));
  }

  accept(state) {
    this.states = state.states;
  }

  reject() {}
}
