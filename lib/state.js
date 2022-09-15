const emptyStack = require('@iter-tools/imm-stack');
const debug = require('debug')('cst-tokens:stt');
const { indent } = require('./utils/internal.js');
const { Resolver } = require('./resolver.js');

debug.color = 208; // orange

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
  get status() {
    return this[_].status;
  }
  get path() {
    return this[_].path?.facade;
  }
  get source() {
    return this[_].source.facade;
  }
  get result() {
    return this[_].result;
  }
  get resolver() {
    return this[_].resolver.facade;
  }

  toString() {
    return this.source.toString();
  }
}

class State {
  constructor(
    path,
    source,
    resolver = new Resolver(path.node),
    result = emptyStack,
    parent = undefined,
  ) {
    this.status = 'active';
    this.path = path;
    this.parent = parent;
    this.result = result;
    this.source = source;
    this.resolver = resolver;

    this.facade = new StateFacade(this);
  }

  branch() {
    if (debug.enabled) debug(`${indent(this)}branch`);
    if (this.status !== 'active') {
      throw new Error('Cannot branch a state that is not active');
    }
    this.status = 'suspended';
    return new State(this.path, this.source.branch(), this.resolver.branch(), this.result, this);
  }

  accept() {
    if (debug.enabled) debug(`${indent(this.parent)}accept`);
    if (this.status !== 'active') {
      throw new Error('Cannot accept a state that is not active');
    }
    const { path, parent, source, result, resolver } = this;
    const nextState = parent || path.parentState;
    this.status = 'accepted';

    if (nextState) {
      nextState.status = 'active';
      nextState.result = parent ? result : nextState.result;
      nextState.source.accept(source);
      nextState.resolver.accept(resolver);
    } else {
      throw new Error('Nothing to accept');
    }

    return nextState;
  }

  reject() {
    if (debug.enabled) debug(`${indent(this.parent)}reject`);
    if (this.status !== 'active') {
      throw new Error('Cannot reject a state that is not active');
    }
    const { parent = null } = this;

    this.status = 'rejected';

    if (parent) {
      parent.status = 'active';
    }

    return parent;
  }

  toString() {
    const { source, path } = this;
    const sourceSummary = source.facade.toString();
    return `${path.node.type}${sourceSummary && ` (at ${sourceSummary})`}`;
  }
}

module.exports = { State };
