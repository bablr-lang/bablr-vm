import { buildDependentLanguages } from '@bablr/helpers/grammar';
import { getGapNode } from './facades.js';

let facades = new WeakMap();

export const Context = class BABLRContext {
  static from(language, productionEnhancer) {
    return new Context(buildDependentLanguages(language), productionEnhancer);
  }

  constructor(languages, productionEnhancer) {
    this.languages = languages;
    this.productionEnhancer = productionEnhancer;
    this.getGrammar = (language) => this.grammars.get(language);

    Object.freeze(productionEnhancer);

    this.unboxedValues = new WeakMap();

    this.grammars = new WeakMap();

    for (const { 1: language } of this.languages) {
      if (!language) throw new Error();
      if (language.default) throw new Error('Do not use import * as on languages');
      this.grammars.set(language, new language.grammar());
    }
  }

  getPublic() {
    let value = facades.get(this);
    if (value) return value;

    let { productionEnhancer, getGrammar } = this;

    value = Object.freeze({
      getGrammar,
      getGapNode,
      productionEnhancer,
    });

    facades.set(this, value);

    return value;
  }
};
