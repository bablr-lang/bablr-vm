import emptyStack from '@iter-tools/imm-stack';

import { freezeSeal } from './utils/object.js';
import { facades } from './utils/facades.js';
import { Resolver } from './resolver.js';
import { TokenizerState } from './tokenize.state.js';
import { _actual, active, suspended, accepted, rejected } from './symbols.js';
import * as sym from './symbols.js';

export class StateFacade {
  constructor(state) {
    this[_actual] = state;

    freezeSeal(this);
  }

  get productionType() {
    return sym.node;
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

  get path() {
    return facades.get(this[_actual].path);
  }

  get result() {
    return this[_actual].tokenizer.result;
  }

  get lexicalContext() {
    return this[_actual].tokenizer.lexicalContext;
  }

  resolve(property) {
    return this[_actual].resolver.resolve(property);
  }

  toString() {
    return this[_actual].tokenizer.toString();
  }
}

export class State {
  constructor(
    path,
    tokenizer, // TokenizerState
    resolvers = emptyStack.push(Resolver.from(path.node)),
    coroutines = emptyStack,
    depth = 0,
    parent = null,
  ) {
    this.path = path;
    this.tokenizer = tokenizer;
    this.resolvers = resolvers;
    this.coroutines = coroutines;
    this.depth = depth;
    this.parent = parent;

    this.status = active;

    const facade = new StateFacade(this);

    facades.set(this, facade);
  }

  static from(path, source) {
    return new State(path, new TokenizerState(source));
  }

  get co() {
    return this.coroutines.value;
  }

  get lexicalContext() {
    return this.tokenizer.lexicalContext;
  }

  get result() {
    return this.tokenizer.result;
  }

  get resolver() {
    return this.resolvers.value;
  }

  get node() {
    return this.path.node;
  }

  get isActive() {
    return this.status === active;
  }

  branch() {
    if (this.status !== active) {
      throw new Error('Cannot branch a state that is not active');
    }

    this.status = suspended;

    const { path, tokenizer, resolvers, coroutines, depth } = this;
    const nextState = new State(path, tokenizer, resolvers, coroutines, depth + 1, this);

    return nextState;
  }

  accept() {
    if (this.status !== active) {
      throw new Error('Cannot accept a state that is not active');
    }

    this.status = accepted;

    const { parent } = this;

    parent.tokenizer.accept(this.tokenizer);

    parent.path = this.path;
    parent.resolvers = this.resolvers;
    parent.status = active;

    return parent;
  }

  reject() {
    if (this.status !== active) {
      throw new Error('Cannot reject a state that is not active');
    }

    const { parent } = this;

    this.status = rejected;

    if (parent) {
      parent.status = active;
    }

    return parent;
  }

  toString() {
    const { tokenizer, path } = this;
    const sourceSummary = tokenizer.toString();

    return `${path.node.type}${sourceSummary && ` (at ${sourceSummary})`}`;
  }
}
