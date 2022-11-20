const { isArray, freezeSeal } = require('./utils/object.js');
const { _actual } = require('./symbols.js');
const { cstNodesByRef } = require('./cst.js');

const isString = (value) => typeof value === 'string';

class GrammarFacade {
  constructor(grammar) {
    this[_actual] = grammar;

    freezeSeal(this);
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

  nodeForRef(ref) {
    return cstNodesByRef.get(ref);
  }

  productionFor(type) {
    return this[_actual].productionFor(type);
  }
}

const setProductions = (productions, subtypesByType, type, production) => {
  const subtypes = subtypesByType.get(type);
  if (subtypes) {
    for (const subtype of subtypes) {
      setProductions(productions, subtypesByType, subtype, production);
    }
  } else {
    const next = productions.get(type);

    productions.set(type, function lateBindNextWrapper(props) {
      return production(props, next);
    });
  }
};

const buildProductions = (productions, aliases) => {
  const productionsByType = new Map();

  for (const [type, production] of productions) {
    setProductions(productionsByType, aliases, type, production);
  }

  return productionsByType;
};

class Grammar {
  constructor(grammar, base) {
    const { productions, aliases = new Map(), context } = grammar;

    this.base = base;
    this.subtypesByType = new Map(aliases);
    this.context = context;

    this.productions = buildProductions(productions, aliases);

    for (const [type, subtypes] of this.subtypesByType) {
      if (!isString(type)) throw new Error('alias key must be a string');
      if (!isArray(subtypes)) throw new Error('alias value must be an array');
      if (!subtypes.every(isString)) throw new Error('alias value must be an array of strings');
    }
  }

  productionFor(type) {
    return this.productions.get(type) || this.base?.productionFor(type);
  }
}

module.exports = { GrammarFacade, Grammar, buildProductions };
