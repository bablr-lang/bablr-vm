import { isDeepRecord } from '@bablr/record';
import { getGapNode } from './facades.js';
import { freeze, getPrototypeOf, isFrozen, isObject, isString } from '@bablr/agast-helpers/object';

let facades = new WeakMap();

export const Context = class BABLRContext {
  static from(productionEnhancer) {
    return new Context(productionEnhancer);
  }

  constructor(productionEnhancer) {
    this.productionEnhancer = productionEnhancer;

    this.validLanguages = new WeakSet();
    this.validNodesByLanguage = new WeakMap();
    this.grammars = new WeakMap();
  }

  getPublic() {
    let value = facades.get(this);
    if (value) return value;

    let { productionEnhancer } = this;

    let getGrammar = (language) => this.getGrammar(language);

    value = freeze({
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
      this.grammars.set(language, (grammar = freeze(new language())));
    }

    return grammar;
  }

  validateLanguage(language) {
    let { validLanguages } = this;
    if (validLanguages.has(language)) return;

    if (!isFrozen(language))
      throw new Error(
        (language?.canonicalURL || 'language') + ' missing Object.freeze(bablrLanguage)',
      );

    if (language.default) throw new Error('Do not use import * on languages');

    let { canonicalURL, dependencies, fragmentProduction, context } = language;

    if (canonicalURL != null && !isString(canonicalURL))
      throw new Error(language.canonicalURL + ' canonicalURL is not a string');
    if (fragmentProduction != null && !isString(fragmentProduction))
      throw new Error(language.canonicalURL + ' fragmentProduction is not a string');
    if (context != null && !isDeepRecord(context))
      throw new Error(language.canonicalURL + ' context is not deeply frozen');
    if (dependencies != null && (!isObject(dependencies) || !isFrozen(dependencies)))
      throw new Error(language.canonicalURL + ' missing Object.freeze(bablrLanguage.dependencies)');

    let { prototype } = language;

    while (prototype !== Object.prototype) {
      if (!isFrozen(prototype.constructor)) {
        throw new Error(
          (prototype.constructor.canonicalURL || 'language') +
            ' missing Object.freeze(bablrLanguage)',
        );
      }
      if (!isFrozen(prototype)) {
        throw new Error(
          (prototype.constructor.canonicalURL || 'language') +
            ' missing Object.freeze(bablrLanguage.prototype)',
        );
      }
      prototype = getPrototypeOf(prototype);
    }

    if (dependencies != null) {
      for (let dependency of Object.values(dependencies)) {
        this.validateLanguage(dependency);
      }
    }

    validLanguages.add(language);
  }
};
