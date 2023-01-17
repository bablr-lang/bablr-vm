import { freezeSeal } from './utils/object.js';
import { Resolver } from './resolver.js';
import { _actual, active, suspended, accepted, rejected } from './symbols.js';
import { facades } from './utils/facades.js';

export class StateFacade {
  constructor(state) {
    this[_actual] = state;

    freezeSeal(this);
  }

  get isRoot() {
    return this[_actual].isRoot;
  }
  get status() {
    return this[_actual].status;
  }
  get path() {
    return facades.get(this[_actual].path);
  }
  get tokenizer() {
    return facades.get(this[_actual].tokenizer);
  }
  get resolver() {
    return facades.get(this[_actual].resolver);
  }

  toString() {
    return this.tokenizer.toString();
  }
}

export class State {
  constructor(
    path,
    tokenizer,
    production,
    depth = 0,
    resolver = path && new Resolver(path.node),
    parent = null,
  ) {
    this.path = path;
    this.tokenizer = tokenizer;
    this.production = production;
    this.depth = depth;
    this.resolver = resolver;
    this.parent = parent;

    this.status = active;

    facades.set(this, new StateFacade(this));
  }

  get node() {
    return this.path?.node;
  }

  get isRoot() {
    return this.depth !== this.parent?.depth;
  }

  get isActive() {
    return this.status === active;
  }

  branch() {
    if (this.status !== active) {
      throw new Error('Cannot branch a state that is not active');
    }

    this.status = suspended;

    const nextState = new State(
      this.path,
      this.tokenizer,
      this.production,
      this.depth,
      this.resolver,
      this,
    );

    return nextState;
  }

  accept() {
    if (this.status !== active) {
      throw new Error('Cannot accept a state that is not active');
    }

    const { parent, tokenizer, resolver } = this;

    this.status = accepted;

    parent.status = active;
    parent.tokenizer.accept(tokenizer);
    parent.resolver.accept(resolver);

    return parent;
  }

  reject() {
    if (this.status !== active) {
      throw new Error('Cannot reject a state that is not active');
    }

    const { parent } = this;

    this.tokenizer.reject();
    this.status = rejected;

    parent.status = active;

    return parent;
  }

  toString() {
    const { tokenizer, path } = this;
    const sourceSummary = tokenizer.toString();

    return `${path.node.type}${sourceSummary && ` (at ${sourceSummary})`}`;
  }
}
