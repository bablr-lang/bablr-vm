import { getGapNode } from './facades.js';
import { freeze, isFrozen, isObject, isString } from '@bablr/agast-helpers/object';

let facades = new WeakMap();

export const Context = class BABLRContext {
  static from(productionEnhancer) {
    return new Context(productionEnhancer);
  }

  constructor(productionEnhancer) {
    this.productionEnhancer = productionEnhancer;

    Object.freeze(productionEnhancer);

    this.validLanguages = new WeakSet();
    this.validNodesByLanguage = new WeakMap();
    this.grammars = new WeakMap();
  }

  getPublic() {
    let value = facades.get(this);
    if (value) return value;

    let { productionEnhancer } = this;

    let getGrammar = (language) => this.getGrammar(language);

    value = Object.freeze({
      getGrammar,
      getGapNode,
      productionEnhancer,
    });

    facades.set(this, value);

    return value;
  }

  isKnownValid(language, node) {
    let { validNodesByLanguage } = this;
    let languageNodes = validNodesByLanguage.get(language);

    return languageNodes?.get(language)?.has(node) || false;
  }

  registerNode(language, node) {
    let { validNodesByLanguage } = this;
    let languageNodes = validNodesByLanguage.get(language);

    if (!languageNodes) {
      languageNodes = new WeakSet();
      validNodesByLanguage.set(language, languageNodes);
    }

    languageNodes.add(node);
  }

  getGrammar(language) {
    this.validateLanguage(language);

    let grammar = this.grammars.get(language);

    if (!grammar) {
      this.grammars.set(language, (grammar = freeze(new language.grammar())));
    }

    return grammar;
  }

  validateGrammar(language) {
    let { grammar } = language;
    if (!isFrozen(grammar)) {
      throw new Error(language.canonicalURL + ' missing Object.freeze(bablrLanguage.grammar)');
    }
    if (!isFrozen(grammar.prototype)) {
      throw new Error(
        language.canonicalURL + ' missing Object.freeze(bablrLanguage.grammar.prototype)',
      );
    }
  }

  validateLanguage(language) {
    let { validLanguages, isValidGrammar } = this;
    if (validLanguages.has(language)) return;

    if (!isFrozen(language))
      throw new Error(language.canonicalURL + ' missing Object.freeze(bablrLanguage)');

    if (language.default) throw new Error('Do not use import * on languages');

    let { grammar, canonicalURL, defaultMatcher, dependencies, fragmentProduction } = language;

    if (canonicalURL != null && !isString(canonicalURL)) throw new Error();
    if (fragmentProduction != null && !isString(fragmentProduction)) throw new Error();
    if (dependencies != null && (!isObject(dependencies) || !isFrozen(dependencies)))
      throw new Error(
        language.canonicalURL + ' missing Object.freeze(bablrLanguage.grammar.dependencies)',
      );

    this.validateGrammar(language);

    for (let dependency of Object.values(dependencies)) {
      this.validateLanguage(dependency);
    }

    validLanguages.add(language);
  }
};
