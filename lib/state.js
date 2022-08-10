const { Resolver } = require('./resolver.js');

const _ = Symbol('private');

class StateFacade {
  constructor(state) {
    this[_] = state;
    if (state.facade) {
      throw new Error('A state can have only one facade');
    }
    state.facade = this;
  }

  get parent() {
    return this[_].parent?.facade;
  }
  get path() {
    return this[_].path?.facade;
  }
  get source() {
    return this[_].source.facade;
  }
  get resolver() {
    return this[_].resolver.facade;
  }

  toString() {
    return this.source.toString();
  }
}

class State {
  constructor(path, source, resolver = new Resolver(path.node), parent = undefined) {
    this.path = path;
    this.parent = parent;
    this.source = source;
    this.resolver = resolver;

    this.facade = new StateFacade(this);
  }

  branch() {
    return new State(this.path, this.source.branch(), this.resolver.branch(), this);
  }

  accept(acceptedState) {
    const { source, resolver } = acceptedState;

    this.source.accept(source);
    this.resolver.accept(resolver);

    return this;
  }

  toString() {
    const { source, path } = this;
    const sourceSummary = source.facade.toString();
    return `${path.node.type}${sourceSummary && ` (at ${sourceSummary})`}`;
  }
}

module.exports = { State };
