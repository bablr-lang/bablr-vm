import { Grammar as BaseGrammar, productionFor } from '@bablr/grammar';
import { map, concat } from '@bablr/helpers/iterable';
import { gapTokenTag, gapNodeTag } from './utils/ast.js';
import { facades } from './utils/facades.js';
import { objectEntries } from './utils/object.js';
import * as sym from '@bablr/helpers/symbols';

const matchFrom = (effects, matchable) => ({ type: sym.match, value: { effects, matchable } });

const eat = { success: sym.eat, failure: sym.none };

const tokenAliasProductionsEnhancer = (grammar) => {
  const aliasProductions = map(([aliasType, types]) => {
    return productionFor(aliasType, function* match(props) {
      const { value, attrs } = props;
      const matchables = types.map((type) => gapTokenTag(type, value, attrs));

      yield matchFrom(eat, gapTokenTag('Any', null, new Map(objectEntries({ matchables }))));
    });
  }, grammar.aliases);

  return { ...grammar, productions: concat(aliasProductions, grammar.productions) };
};

const nodeAliasProductionsEnhancer = (grammar) => {
  const aliasProductions = map(([aliasType, types]) => {
    return productionFor(aliasType, function* match(props) {
      const { value, attrs } = props;
      const matchables = types.map((type) => gapTokenTag(type, value, attrs));

      yield matchFrom(eat, gapNodeTag('Any', new Map(objectEntries({ matchables }))));
    });
  }, grammar.aliases);

  return { ...grammar, productions: concat(aliasProductions, grammar.productions) };
};

export class TokenGrammar extends BaseGrammar {
  constructor(grammar) {
    super(tokenAliasProductionsEnhancer(grammar));

    if (!this.aliases.has('Token')) {
      throw new Error('A Token alias is required');
    }

    new GrammarFacade(this);
  }

  get productionType() {
    return sym.token;
  }
}

export class NodeGrammar extends BaseGrammar {
  constructor(grammar) {
    super(nodeAliasProductionsEnhancer(grammar));

    if (!this.aliases.has('Node')) {
      throw new Error('A Node alias is required');
    }

    new GrammarFacade(this);
  }

  get productionType() {
    return sym.node;
  }
}

export class GrammarFacade {
  constructor(grammar) {
    facades.set(grammar, this);
  }

  get productionType() {
    return facades.get(this).productionType;
  }

  get aliases() {
    return facades.get(this).aliases;
  }

  get size() {
    return facades.get(this).size;
  }

  has(type) {
    return facades.get(this).has(type);
  }

  get(type) {
    return facades.get(this).get(type);
  }

  is(supertype, type) {
    return facades.get(this).is(supertype, type);
  }

  keys() {
    return facades.get(this).keys();
  }

  values() {
    return facades.get(this).values();
  }

  entries() {
    return facades.get(this).entries();
  }

  forEach(fn) {
    facades.get(this).forEach(fn);
  }

  [Symbol.iterator]() {
    return facades.get(this)[Symbol.iterator]();
  }
}
