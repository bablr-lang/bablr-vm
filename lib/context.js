import { buildDependentLanguages } from '@bablr/helpers/grammar';

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
    let { productionEnhancer, getGrammar } = this;

    return Object.freeze({
      getGrammar,
      productionEnhancer,
    });
  }
};
