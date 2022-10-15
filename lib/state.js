const emptyStack = require('@iter-tools/imm-stack');
const debug = require('debug')('cst-tokens:stt');
const { indentModule } = require('./utils/internal.js');
const { ResolverFacade } = require('./resolver.js');
const { _ } = require('./symbols.js');

debug.color = 208; // orange

class StateFacade {
  constructor(state) {
    this[_] = state;
  }

  get parent() {
    return this[_].parent;
  }
  get status() {
    return this[_].status;
  }
  get path() {
    return this[_].path;
  }
  get source() {
    return this[_].source;
  }
  get result() {
    return this[_].result;
  }
  get resolver() {
    return this[_].resolver;
  }

  toString() {
    return this.source.toString();
  }
}

class State {
  constructor(
    path,
    source,
    resolver = ResolverFacade.from(path.node),
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
    if (debug.enabled) debug(`${indentModule(this)}branch`);
    if (this.status !== 'active') {
      throw new Error('Cannot branch a state that is not active');
    }
    this.status = 'suspended';
    return new State(this.path, this.source.branch(), this.resolver.branch(), this.result, this);
  }

  accept() {
    if (debug.enabled) debug(`${indentModule(this.parent)}accept`);
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
    if (debug.enabled) debug(`${indentModule(this.parent)}reject`);
    if (this.status !== 'active') {
      throw new Error('Cannot reject a state that is not active');
    }
    const { parent = null } = this;

    this.source.reject();

    this.status = 'rejected';

    if (parent) {
      parent.status = 'active';
    }

    return parent;
  }

  toString() {
    const { source, path } = this;
    const sourceSummary = source.toString();
    return `${path.node.type}${sourceSummary && ` (at ${sourceSummary})`}`;
  }
}

module.exports = { State };
