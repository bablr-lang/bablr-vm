import { WeakStackFrame } from '../utils/object.js';
import { facades, actuals } from '../utils/facades.js';
import { Resolver } from '../resolver.js';
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

  resolve(property) {
    return actuals.get(this).resolver.resolve(property);
  }
}

export class State extends WeakStackFrame {
  constructor(context, resolver, path) {
    super();

    this.context = context;
    this.resolver = resolver;
    this.path = path;

    this.status = sym.active;

    new StateFacade(this);
  }

  static from(context, path) {
    const state = new State(context, Resolver.from(path.node), path);

    return state.stack.push(null, state);
  }

  get stack() {
    return this.context.states;
  }

  get speculative() {
    return !!this.parent;
  }

  get node() {
    return this.path.node;
  }

  branch() {
    const { context, resolvers, path } = this;

    if (this.status !== sym.active && this.status) {
      throw new Error('Cannot branch a state that is not active');
    }

    this.status = sym.suspended;

    const nextResolvers = new WeakMap([[path, resolvers.get(path)]]);

    return this.push(new State(context, nextResolvers, path));
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
