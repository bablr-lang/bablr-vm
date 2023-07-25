import { WeakStackFrame } from '../utils/object.js';
import { facades, actuals } from '../utils/facades.js';
import * as sym from '../symbols.js';

export class StateFacade {
  constructor(state) {
    facades.set(state, this);
  }

  get productionType() {
    return sym.node;
  }

  get depth() {
    return actuals.get(this).depth;
  }

  get parent() {
    return facades.get(actuals.get(this).parent);
  }

  get status() {
    return actuals.get(this).status;
  }

  get path() {
    return facades.get(actuals.get(this).path);
  }
}

export class State extends WeakStackFrame {
  constructor(context, path) {
    super();

    this.context = context;
    this.path = path;

    this.status = sym.active;

    new StateFacade(this);
  }

  static from(context, path) {
    const state = new State(context, path);

    return state.stack.push(null, state);
  }

  get stack() {
    return this.context.states;
  }

  get speculative() {
    return !!this.parent;
  }

  branch() {
    const { context, path } = this;

    if (this.status !== sym.active && this.status) {
      throw new Error('Cannot branch a state that is not active');
    }

    this.status = sym.suspended;

    return this.push(new State(context, path));
  }

  accept(state) {
    if (state.status !== sym.active) {
      throw new Error('Cannot accept a state that is not active');
    }

    this.path = state.path;
    this.status = sym.accepted;
  }

  reject() {
    if (this.status !== sym.active) {
      throw new Error('Cannot reject a state that is not active');
    }

    this.status = sym.rejected;
  }
}
