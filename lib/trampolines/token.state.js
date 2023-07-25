import emptyStack from '@iter-tools/imm-stack';

import { WeakStackFrame } from '../utils/object.js';
import { facades, actuals } from '../utils/facades.js';
import { createTokenTag } from '../utils/token.js';
import * as sym from '../symbols.js';

export class TokenizerStateFacade {
  constructor(state) {
    facades.set(state, this);
  }

  get productionType() {
    return sym.token;
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

  get lastTag() {
    return actuals.get(this).lastTag;
  }

  get lexicalContext() {
    return actuals.get(this).lexicalContext;
  }
}

export class TokenizerState extends WeakStackFrame {
  constructor(
    context,
    source,
    lastTag = createTokenTag(sym.BOF),
    match = null,
    spans = emptyStack.push('Bare'),
  ) {
    super();

    this.context = context;
    this.source = source;
    this.lastTag = lastTag;
    this.match = match;
    this.spans = spans;

    this.status = sym.suspended;

    new TokenizerStateFacade(this);
  }

  static from(context, source) {
    const tokenState = new TokenizerState(context, source);

    return tokenState.stack.push(null, tokenState);
  }

  get stack() {
    return this.context.states;
  }

  get done() {
    return this.source.done;
  }

  get lexicalContext() {
    return this.spans.value;
  }

  get isActive() {
    return this.status === sym.active;
  }

  pushLexicalContext(context) {
    this.spans = this.spans.push(context);
  }

  popLexicalContext() {
    if (!this.spans.size) throw new Error('No lexical context to pop');

    this.spans = this.spans.prev;
  }

  branch() {
    const { context, source, lastTag, match, spans } = this;

    if (this.status !== sym.active && this.status !== sym.suspended) {
      throw new Error('Cannot branch a state that is not on top');
    }

    const nextState = new TokenizerState(context, source.branch(), lastTag, match, spans);

    this.status = sym.suspended;
    nextState.status = sym.active;

    return this.push(nextState);
  }

  accept(state) {
    if (state.status !== sym.active && this.status !== sym.suspended) {
      throw new Error('Cannot accept a state that is not on top');
    }

    state.status = sym.accepted;

    this.lastTag = state.lastTag;
    this.match = state.match;
    this.spans = state.spans;

    this.source.accept(state.source);
  }

  reject() {
    this.source.reject();
    this.status = sym.rejected;
  }
}
