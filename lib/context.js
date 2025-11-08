import { buildDependentLanguages } from '@bablr/helpers/grammar';
import { facades, actuals } from './facades.js';

export const ContextFacade = class BABLRContextFacade {
  constructor(actual) {
    facades.set(actual, this);
    Object.freeze(this);
  }

  get languages() {
    return actuals.get(this).languages;
  }

  get grammars() {
    return actuals.get(this).grammars;
  }

  get productionEnhancer() {
    return actuals.get(this).productionEnhancer;
  }
};

export const Context = class BABLRContext {
  static from(language, productionEnhancer) {
    return new Context(buildDependentLanguages(language), productionEnhancer);
  }

  constructor(languages, productionEnhancer) {
    this.languages = languages;
    this.productionEnhancer = productionEnhancer;

    this.unboxedValues = new WeakMap();

    this.grammars = new WeakMap();
    this.facade = new ContextFacade(this);

    for (const { 1: language } of this.languages) {
      if (!language) throw new Error();
      if (language.default) throw new Error('Do not use import * as on languages');
      this.grammars.set(language, new language.grammar());
    }
  }
};
