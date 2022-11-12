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

  get grammarOptions() {
    return this[_actual].grammar.options;
  }

  get generators() {
    return this[_actual].grammar.generators;
  }

  get matchNodesByRef() {
    return this[_actual].matchNodesByRef;
  }
}

class Context {
  constructor(source, grammar, options = {}) {
    this.source = source;
    this.grammar = grammar;
    this.options = options;

    this.matchNodesByRef = new WeakMap();
  }
}

module.exports = { Context, ContextFacade };
