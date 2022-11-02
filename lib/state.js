const emptyStack = require('@iter-tools/imm-stack');
const { ResolverFacade } = require('./resolver.js');
const { _actual, leadingHoist, Fragment } = require('./symbols.js');

class StateFacade {
  constructor(state) {
    this[_actual] = state;
  }

  get parent() {
    let { parent } = this[_actual];
    while (parent && parent.path.node.type === Fragment) parent = parent.parent;
    return parent.facade;
  }
  get isRoot() {
    return this[_actual].isRoot;
  }
  get status() {
    return this[_actual].status;
  }
  get path() {
    return this[_actual].path;
  }
  get node() {
    return this[_actual].path.node;
  }
  get source() {
    return this[_actual].source;
  }
  get hoisting() {
    return this[_actual].hoisting;
  }
  get resolver() {
    return this[_actual].resolver;
  }

  toString() {
    return this.source.toString();
  }
}

class State {
  constructor(
    path,
    source,
    grammar,
    depth = 0,
    hoisting = leadingHoist,
    resolver = path && ResolverFacade.from(path.node),
    result = emptyStack,
    parent = null,
  ) {
    this.path = path;
    this.source = source;
    this.grammar = grammar;
    this.depth = depth;
    this.hoisting = hoisting;
    this.resolver = resolver;
    this.result = result;
    this.parent = parent;

    this.status = 'active';
    this.facade = new StateFacade(this);
  }

  get node() {
    return this.path?.node;
  }

  get isRoot() {
    return this.depth !== this.parent?.depth;
  }

  get isActive() {
    return this.status === 'active';
  }

  branch() {
    if (this.status !== 'active') {
      throw new Error('Cannot branch a state that is not active');
    }

    this.status = 'suspended';

    const nextState = new State(
      this.path,
      this.source,
      this.grammar,
      this.depth,
      this.hoisting,
      this.resolver,
      this.result,
      this,
    );

    return nextState;
  }

  accept() {
    if (this.status !== 'active') {
      throw new Error('Cannot accept a state that is not active');
    }

    const { parent, path, source, resolver, result, hoisting } = this;

    this.status = 'accepted';

    parent.status = 'active';
    parent.source === source ? source : parent.source.accept(source);
    parent.resolver === resolver ? resolver : parent.resolver.accept(resolver);
    parent.result = parent.path === path ? result : parent.result;
    parent.hoisting = parent.path === path ? hoisting : parent.hoisting;

    return parent;
  }

  reject() {
    if (this.status !== 'active') {
      throw new Error('Cannot reject a state that is not active');
    }

    const { parent } = this;

    this.source.reject();
    this.status = 'rejected';

    parent.status = 'active';

    return parent;
  }

  toString() {
    const { source, path } = this;
    const sourceSummary = source.toString();

    return `${path.node.type}${sourceSummary && ` (at ${sourceSummary})`}`;
  }
}

module.exports = { State };
