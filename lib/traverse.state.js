import { WeakStackFrame } from './utils/object.js';
import { facades, actuals } from './utils/facades.js';
import { TokenizerState } from './tokenize.state.js';
import { _none } from './symbols.js';
import * as sym from './symbols.js';

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

  get lastToken() {
    return actuals.get(this).tokenState.lastToken;
  }

  get lexicalContext() {
    return actuals.get(this).tokenState.lexicalContext;
  }

  testCurrent(type) {
    return actuals.get(this).tokenState.testCurrent(type);
  }

  resolve(property) {
    return actuals.get(this).resolver.resolve(property);
  }

  toString() {
    return actuals.get(this).tokenState.toString();
  }
}

export class State extends WeakStackFrame {
  constructor(context, tokenState, resolvers = new WeakMap(), path = null) {
    super();

    this.context = context;
    this.tokenState = tokenState;
    this.resolvers = resolvers;
    this.path = path;

    this.status = sym.active;

    new StateFacade(this);
  }

  static from(context, source) {
    const state = new State(context, TokenizerState.from(context, source));

    return state.stack.push(null, state);
  }

  get stack() {
    return this.context.states;
  }

  get resolver() {
    return this.resolvers.get(this.path);
  }

  get speculative() {
    return !!this.parent;
  }

  get lexicalContext() {
    return this.tokenState.lexicalContext;
  }

  get lastToken() {
    return this.tokenState.lastToken;
  }

  get node() {
    return this.path.node;
  }

  branch() {
    const { context, tokenState, resolvers, path } = this;

    if (this.status !== sym.active && this.status) {
      throw new Error('Cannot branch a state that is not active');
    }

    this.status = sym.suspended;

    const nextTokenState = tokenState.branch();
    const nextResolvers = new WeakMap([[path, resolvers.get(path)]]);

    return this.push(new State(context, nextTokenState, nextResolvers, path));
  }

  accept(state) {
    if (state.status !== sym.active) {
      throw new Error('Cannot accept a state that is not active');
    }

    this.tokenState.accept(state.tokenState);
    this.path = state.path;
    this.status = sym.accepted;
  }

  reject() {
    if (this.status !== sym.active) {
      throw new Error('Cannot reject a state that is not active');
    }

    this.tokenState.reject();
    this.status = sym.rejected;
  }

  toString() {
    const { tokenState, path } = this;
    const sourceSummary = tokenState.toString();

    return `${path.node.type}${sourceSummary && ` (at ${sourceSummary})`}`;
  }
}
