import emptyStack from '@iter-tools/imm-stack';

import { WeakStackFrame, isObject } from '../utils/object.js';
import { facades, actuals } from '../utils/facades.js';
import { createToken } from '../utils/token.js';
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

  get lastToken() {
    return actuals.get(this).lastToken;
  }

  get lexicalContext() {
    return actuals.get(this).lexicalContext;
  }

  testCurrent(type) {
    return actuals.get(this).testCurrent(type);
  }
}

export class TokenizerState extends WeakStackFrame {
  constructor(
    context,
    source, // Iterable<string | Token>
    lastToken = createToken(sym.BOF),
    match = null, // { type: TokenType, value: String, done: boolean }
    lexicalContexts = emptyStack.push('Bare'),
  ) {
    super();

    this.context = context;
    this.source = source;
    this.lastToken = lastToken;
    this.match = match;
    this.lexicalContexts = lexicalContexts;

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
    return this.lexicalContexts.value;
  }

  get isActive() {
    return this.status === sym.active;
  }

  testCurrent(type) {
    switch (type) {
      case sym.StartNode:
        return isObject(this.source.value) && this.source.value.type === sym.StartNode;
      case sym.EndNode:
        return isObject(this.source.value) && this.source.value.type === sym.EndNode;
      case sym.EOF:
        return !!this.source.done;
      default:
        throw new Error();
    }
  }

  pushLexicalContext(context) {
    this.lexicalContexts = this.lexicalContexts.push(context);
  }

  popLexicalContext() {
    if (!this.lexicalContexts.size) throw new Error('No lexical context to pop');

    this.lexicalContexts = this.lexicalContexts.prev;
  }

  branch() {
    const { context, source, lastToken, match, lexicalContexts } = this;

    if (this.status !== sym.active && this.status !== sym.suspended) {
      throw new Error('Cannot branch a state that is not on top');
    }

    const nextState = new TokenizerState(
      context,
      source.branch(),
      lastToken,
      match,
      lexicalContexts,
    );

    this.status = sym.suspended;
    nextState.status = sym.active;

    return this.push(nextState);
  }

  accept(state) {
    if (state.status !== sym.active && this.status !== sym.suspended) {
      throw new Error('Cannot accept a state that is not on top');
    }

    state.status = sym.accepted;

    this.lastToken = state.lastToken;
    this.match = state.match;
    this.lexicalContexts = state.lexicalContexts;

    this.source.accept(state.source);
  }

  reject() {
    this.source.reject();
    this.status = sym.rejected;
  }
}
