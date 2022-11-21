import emptyStack from '@iter-tools/imm-stack';

import { freezeSeal } from './utils/object.js';
import { Resolver } from './resolver.js';
import { _actual, leadingHoist, active, suspended, accepted, rejected } from './symbols.js';
import { facades } from './facades.js';

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
  get node() {
    return this[_actual].path.node;
  }
  get source() {
    return facades.get(this[_actual].source);
  }
  get hoist() {
    return this[_actual].hoist;
  }
  get hoistPathDepth() {
    return this[_actual].hoistPathDepth;
  }
  get hoistPath() {
    return this[_actual].hoistPath;
  }
  get resolver() {
    return facades.get(this[_actual].resolver);
  }

  toString() {
    return this.source.toString();
  }
}

export class State {
  constructor(
    path,
    source,
    production,
    depth = 0,
    hoist = leadingHoist,
    hoistPathDepth = 0,
    resolver = path && new Resolver(path.node),
    result = emptyStack,
    parent = null,
  ) {
    this.path = path;
    this.source = source;
    this.production = production;
    this.depth = depth;
    this.hoist = hoist;
    this.hoistPathDepth = hoistPathDepth;
    this.resolver = resolver;
    this.result = result;
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

  get hoistPath() {
    return this.path.at(this.hoistPathDepth);
  }

  branch() {
    if (this.status !== active) {
      throw new Error('Cannot branch a state that is not active');
    }

    this.status = suspended;

    const nextState = new State(
      this.path,
      this.source,
      this.production,
      this.depth,
      this.hoist,
      this.hoistPathDepth,
      this.resolver,
      this.result,
      this,
    );

    return nextState;
  }

  accept() {
    if (this.status !== active) {
      throw new Error('Cannot accept a state that is not active');
    }

    const { parent, path, source, resolver, result, hoist, hoistPathDepth } = this;

    this.status = accepted;

    parent.status = active;
    parent.source.accept(source);
    parent.resolver.accept(resolver);
    parent.hoistPathDepth = hoistPathDepth;

    if (parent.path === path) {
      parent.hoist = hoist;
      parent.result = result;
    }

    return parent;
  }

  reject() {
    if (this.status !== active) {
      throw new Error('Cannot reject a state that is not active');
    }

    const { parent } = this;

    this.source.reject();
    this.status = rejected;

    parent.status = active;

    return parent;
  }

  toString() {
    const { source, path } = this;
    const sourceSummary = source.toString();

    return `${path.node.type}${sourceSummary && ` (at ${sourceSummary})`}`;
  }
}
