const { _actual } = require('./symbols.js');

const { isArray } = Array;
const isString = (value) => typeof value === 'string';
const { hasOwn } = Object;

function* objectKeys(obj) {
  for (const key in obj) if (hasOwn(obj, key)) yield key;
}

class GrammarFacade {
  constructor(grammar) {
    this[_actual] = grammar;
  }

  static from(grammar) {
    return new GrammarFacade(
      new Grammar(grammar, grammar.base ? GrammarFacade.from(grammar.base) : null),
    );
  }

  get base() {
    return this[_actual].base;
  }

  get context() {
    return this[_actual].context;
  }

  get matchNodesByRef() {
    return this[_actual].matchNodesByRef;
  }

  productionFor(type) {
    return this[_actual].productionFor(type);
  }
}

class Grammar {
  constructor(grammar, base) {
    const { productions, aliases, context } = grammar;

    this.base = base;
    this.typesByProduction = new Map(aliases);
    this.context = context;

    this.productionByType = new Map();
    this.matchNodesByRef = new WeakMap();

    for (const production of this.typesByProduction.keys()) {
      if (!isString(production)) throw new Error('alias key must be a string');
    }

    for (const production of objectKeys(productions)) {
      const types = this.typesByProduction.get(production);
      if (types) {
        if (!isArray(types)) throw new Error('alias value must be an array');
        for (const type of types) {
          if (!isString(type)) throw new Error('alias value must be an array of strings');

          this.productionByType.set(type, productions[production]);
        }
      } else {
        this.productionByType.set(production, productions[production]);
      }
    }
  }

  productionFor(type) {
    return this.productionByType.get(type) || this.base?.productionFor(type);
  }
}

module.exports = { GrammarFacade, Grammar };
