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
    grammar,
    resolver = ResolverFacade.from(path.node),
    result = emptyStack,
    parent = undefined,
  ) {
    this.path = path;
    this.source = source;
    this.resolver = resolver;
    this.result = result;
    this.parent = parent;

    this.grammar = grammar;
    this.status = 'active';
    this.facade = new StateFacade(this);
  }

  branch(log = true) {
    if (debug.enabled && log) debug(indentModule(this, 'branch'));

    if (this.status !== 'active') {
      throw new Error('Cannot branch a state that is not active');
    }

    this.status = 'suspended';

    const nextState = new State(
      this.path,
      this.source,
      this.grammar,
      this.resolver,
      this.result,
      this,
    );

    return nextState;
  }

  accept(log = true) {
    if (debug.enabled && log) debug(`${indentModule(this.parent)}accept`);

    if (this.status !== 'active') {
      throw new Error('Cannot accept a state that is not active');
    }

    const { parent, path, source, resolver, result } = this;

    this.status = 'accepted';

    if (parent) {
      parent.status = 'active';
      parent.source === source ? source : parent.source.accept(source);
      parent.resolver === resolver ? resolver : parent.resolver.accept(resolver);
      parent.result = parent.path === path ? result : parent.result;
    } else {
      throw new Error('Nothing to accept');
    }

    return parent;
  }

  reject(log = true) {
    if (debug.enabled && log) debug(`${indentModule(this.parent)}reject`);

    if (this.status !== 'active') {
      throw new Error('Cannot reject a state that is not active');
    }

    const { parent = null } = this;

    this.source.reject();
    this.status = 'rejected';
    if (parent) {
      parent.status = 'active';
    } else {
      throw new Error('parsing failed: grammar did not match');
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
