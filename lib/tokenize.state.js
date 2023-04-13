import emptyStack from '@iter-tools/imm-stack';

import { freezeSeal, isObject } from './utils/object.js';
import { finalizeCoroutine } from './utils/state.js';
import { facades } from './utils/facades.js';
import { createToken } from './utils/token.js';
import { _actual, active, suspended, accepted, rejected } from './symbols.js';
import * as sym from './symbols.js';

export class TokenizerStateFacade {
  constructor(state) {
    this[_actual] = state;

    freezeSeal(this);
  }

  get productionType() {
    return sym.token;
  }

  get depth() {
    return this[_actual].depth;
  }

  get parent() {
    return facades.get(this[_actual].parent);
  }

  get status() {
    return this[_actual].status;
  }

  get result() {
    return this[_actual].result;
  }

  get lexicalContext() {
    return this[_actual].lexicalContext;
  }

  testCurrent(type) {
    return this[_actual].testCurrent(type);
  }

  toString() {
    return this.tokenizer.toString();
  }
}

export class TokenizerState {
  constructor(
    source, // Iterable<string | Token>
    result = createToken(sym.BOF),
    match = null, // { type: TokenType, value: String, done: boolean }
    lexicalContexts = emptyStack.push('Bare'),
    committable = false,
    depth = 0,
    parent = null,
  ) {
    this.source = source;
    this.result = result;
    this.match = match;
    this.coroutines = emptyStack;
    this.lexicalContexts = lexicalContexts;
    this.committable = committable;
    this.depth = depth;
    this.parent = parent;

    this.status = suspended;

    const facade = new TokenizerStateFacade(this);

    facades.set(this, facade);
  }

  get done() {
    return this.source.done;
  }

  get lexicalContext() {
    return this.lexicalContexts.value;
  }

  get co() {
    return this.coroutines.value;
  }

  get isActive() {
    return this.status === active;
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

  pushCo(coroutine) {
    this.coroutines = this.coroutines.push(coroutine);
  }

  popCo() {
    finalizeCoroutine(this);

    this.coroutines = this.coroutines.prev;
  }

  pushLexicalContext(context) {
    this.lexicalContexts = this.lexicalContexts.push(context);
  }

  popLexicalContext() {
    if (!this.lexicalContexts.size) throw new Error('No lexical context to pop');

    this.lexicalContexts = this.lexicalContexts.prev;
  }

  branch(committable) {
    const { source, result, match, lexicalContexts, depth } = this;
    const nextState = new TokenizerState(
      source.branch(committable),
      result,
      match,
      lexicalContexts,
      committable,
      depth + 1,
      this,
    );

    this.status = suspended;
    nextState.status = active;

    return nextState;
  }

  accept() {
    const { parent } = this;

    this.status = accepted;

    if (this.committable) {
      if (parent.status !== suspended) {
        throw new Error('Cannot accept a state that is not on top');
      }

      parent.result = this.result;
      parent.match = this.match;
      parent.lexicalContexts = this.lexicalContexts;
    }

    parent.source.accept(this.source);

    return parent;
  }

  reject() {
    const { parent } = this;

    if (parent && parent.status !== suspended) {
      throw new Error('Cannot reject a state that is not on top');
    }

    this.source.reject();
    this.status = rejected;

    return parent;
  }

  toString() {
    const { tokenizer } = this;
    const sourceSummary = tokenizer.toString();

    return `${sourceSummary && ` (at ${sourceSummary})`}`;
  }
}
