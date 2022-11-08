const emptyStack = require('@iter-tools/imm-stack');
const { ResolverFacade } = require('./resolver.js');
const { _actual } = require('./symbols.js');

class StateFacade {
  constructor(state) {
    this[_actual] = state;
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
  get hoistingPathDepth() {
    return this[_actual].hoistingPathDepth;
  }
  get isHoisting() {
    return this[_actual].isHoisting;
  }
  get hoistingPath() {
    return this[_actual].hoistingPath;
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
    hoistingPathDepth = 0,
    resolver = path && ResolverFacade.from(path.node),
    result = emptyStack,
    parent = null,
  ) {
    this.path = path;
    this.source = source;
    this.grammar = grammar;
    this.depth = depth;
    this.hoistingPathDepth = hoistingPathDepth;
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

  get isHoisting() {
    return this.hoistingPathDepth < this.path.depth;
  }

  get hoistingPath() {
    return this.path.at(this.hoistingPathDepth);
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
      this.hoistingPathDepth,
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

    const { parent, path, source, resolver, result, hoistingPathDepth } = this;

    this.status = 'accepted';

    parent.status = 'active';
    parent.source = parent.source.accept(source);
    parent.resolver = parent.resolver.accept(resolver);
    parent.hoistingPathDepth = hoistingPathDepth;

    if (parent.path === path) {
      parent.result = result;
    }

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
