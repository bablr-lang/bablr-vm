import { WeakStackFrame } from './utils/object.js';
import { facades, actuals } from './utils/facades.js';
import { tokenTag } from './utils/ast.js';
import * as sym from './symbols.js';
import emptyStack from '@iter-tools/imm-stack';

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
  constructor(context, path, chrState, result = tokenTag(sym.BOF)) {
    super();

    if (!path || !chrState) throw new Error('invalid args to tagState');

    this.status = sym.suspended;
    this.context = context;
    this.path = path;
    this.result = result;
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

  get tag() {
    return this.path.tag;
  }

  get isGap() {
    return this.tag.type === 'GapTag';
  }

  get speculative() {
    return !!this.parent;
  }

  branch() {
    const { context, path, result } = this;

    if (this.status !== sym.active && this.status) {
      throw new Error('Cannot branch a state that is not active');
    }

    this.status = sym.suspended;

    return this.push(new TagState(context, path, result));
  }

  accept(state) {
    if (state.status !== sym.active) {
      throw new Error('Cannot accept a state that is not active');
    }

    // this.path = state.path;
    this.result = state.result;
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

  get span() {
    return actuals.get(this).span;
  }
}

export class ChrState extends WeakStackFrame {
  constructor(context, source, match = null, spans = emptyStack.push('Bare')) {
    super();

    this.status = sym.suspended;

    this.context = context;
    this.source = source;
    this.match = match;
    this.spans = spans;

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

  get span() {
    return this.spans.value;
  }

  get isActive() {
    return this.status === sym.active;
  }

  branch() {
    const { context, source, match, spans } = this;

    if (this.status !== sym.active && this.status !== sym.suspended) {
      throw new Error('Cannot branch a state that is not on top');
    }

    const nextState = new ChrState(context, source.branch(), match, spans);

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
    this.spans = state.spans;

    this.source.accept(state.source);
  }

  reject() {
    this.source.reject();
    this.status = sym.rejected;
  }
}
