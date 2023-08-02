import { WeakStackFrame } from './utils/object.js';
import { facades, actuals } from './utils/facades.js';
import { createTokenTag } from './utils/token.js';
import * as sym from './symbols.js';

export class TagStateFacade {
  constructor(state) {
    facades.set(state, this);
  }

  get productionType() {
    return sym.node;
  }

  get status() {
    return actuals.get(this).status;
  }

  get path() {
    return facades.get(actuals.get(this).path);
  }
}

export class TagState extends WeakStackFrame {
  constructor(context, path, chrState, lastTag = createTokenTag(sym.BOF)) {
    super();

    if (!path || !chrState) throw new Error('invalid args to tagState');

    this.status = sym.suspended;
    this.context = context;
    this.path = path;
    this.lastTag = lastTag;
    this.chrState = chrState;

    new TagStateFacade(this);
  }

  static from(context, path, source) {
    const state = new TagState(context, path, ChrState.from(context, source));

    return state.stack.push(null, state);
  }

  get stack() {
    return this.context.states;
  }

  get source() {
    return this.chrState.source;
  }

  get speculative() {
    return !!this.parent;
  }

  branch() {
    const { context, path, lastTag } = this;

    if (this.status !== sym.active && this.status) {
      throw new Error('Cannot branch a state that is not active');
    }

    this.status = sym.suspended;

    return this.push(new TagState(context, path, lastTag));
  }

  accept(state) {
    if (state.status !== sym.active) {
      throw new Error('Cannot accept a state that is not active');
    }

    this.path = state.path;
    this.lastTag = state.lastTag;
    this.status = sym.accepted;
  }

  reject() {
    if (this.status !== sym.active) {
      throw new Error('Cannot reject a state that is not active');
    }

    this.status = sym.rejected;
  }
}

export class ChrStateFacade {
  constructor(state) {
    facades.set(state, this);
  }

  get productionType() {
    return sym.token;
  }

  get status() {
    return actuals.get(this).status;
  }

  get lexicalContext() {
    return actuals.get(this).lexicalContext;
  }
}

export class ChrState extends WeakStackFrame {
  constructor(context, source, match = null) {
    super();

    this.status = sym.suspended;
    this.context = context;
    this.source = source;
    this.match = match;

    new ChrStateFacade(this);
  }

  static from(context, source) {
    const tokenState = new ChrState(context, source);

    return tokenState.stack.push(null, tokenState);
  }

  get stack() {
    return this.context.states;
  }

  get done() {
    return this.source.done;
  }

  get isActive() {
    return this.status === sym.active;
  }

  branch() {
    const { context, source, match } = this;

    if (this.status !== sym.active && this.status !== sym.suspended) {
      throw new Error('Cannot branch a state that is not on top');
    }

    const nextState = new ChrState(context, source.branch(), match);

    this.status = sym.suspended;
    nextState.status = sym.active;

    return this.push(nextState);
  }

  accept(state) {
    if (state.status !== sym.active && this.status !== sym.suspended) {
      throw new Error('Cannot accept a state that is not on top');
    }

    state.status = sym.accepted;

    this.match = state.match;

    this.source.accept(state.source);
  }

  reject() {
    this.source.reject();
    this.status = sym.rejected;
  }
}
