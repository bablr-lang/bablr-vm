const { _actual } = require('./symbols.js');

class ContextFacade {
  constructor(context) {
    this[_actual] = context;
  }

  static from(source, grammar, options) {
    return new ContextFacade(new Context(source, grammar, options));
  }

  get options() {
    return this[_actual].options;
  }

  get generators() {
    return this[_actual].generators;
  }

  get matchNodesByRef() {
    return this[_actual].matchNodesByRef;
  }
}

class Context {
  constructor(source, grammar, options = {}) {
    this.source = source;
    this.generators = grammar.generators;
    this.options = options;

    this.matchNodesByRef = new WeakMap();
  }
}

module.exports = { Context, ContextFacade };
