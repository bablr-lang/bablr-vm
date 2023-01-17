import emptyStack from '@iter-tools/imm-stack';

import { freezeSeal } from './utils/object.js';
import { facades } from './utils/facades.js';
import { _actual, active, suspended, accepted, rejected } from './symbols.js';

export class StateFacade {
  constructor(state) {
    this[_actual] = state;

    freezeSeal(this);
  }

  get status() {
    return this[_actual].status;
  }

  get lexicalContext() {
    return this[_actual].lexicalContext;
  }

  toString() {
    return this.tokenizer.toString();
  }
}

export class TokenizerState {
  constructor(
    source, // Iterable<string | Token>
    match = null, // { type: TokenType, value: String, done: boolean }
    coroutines = emptyStack,
    lexicalContexts = emptyStack.push('Bare'),
    parent = null,
  ) {
    this.source = source;
    this.match = match;
    this.coroutines = coroutines;
    this.lexicalContexts = lexicalContexts;
    this.parent = parent;

    this.status = active;

    const facade = new StateFacade(this);

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

  branch() {
    if (this.status !== active) {
      throw new Error('Cannot branch a state that is not active');
    }

    this.status = suspended;

    const { source, match, coroutines, lexicalContexts } = this;
    const nextState = new TokenizerState(source, match, coroutines, lexicalContexts, this);

    return nextState;
  }

  accept() {
    if (this.status !== active) {
      throw new Error('Cannot accept a state that is not active');
    }

    this.status = accepted;

    const { parent } = this;

    if (parent.status !== suspended) {
      throw new Error('Cannot accept a state that is not on top');
    }

    parent.source = this.source;
    parent.match = this.match;
    parent.lexicalContexts = this.lexicalContexts;
    parent.status = active;

    return parent;
  }

  reject() {
    if (this.status !== active) {
      throw new Error('Cannot reject a state that is not active');
    }

    const { parent } = this;

    if (parent) {
      if (parent.status !== suspended) {
        throw new Error('Cannot reject a state that is not on top');
      }
      parent.status = active;
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
