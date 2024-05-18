import { facades, actuals } from './facades.js';

export const ContextFacade = class BABLRContextFacade {
  get languages() {
    return actuals.get(this).languages;
  }

  get grammars() {
    return actuals.get(this).grammars;
  }

  get productionEnhancer() {
    return actuals.get(this).productionEnhancer;
  }

  get agast() {
    return actuals.get(this).agast;
  }

  getPreviousTerminal(token) {
    return actuals.get(this).agast.getPreviousTerminal(token);
  }

  ownTerminalsFor(range) {
    return actuals.get(this).agast.ownTerminalsFor(range);
  }

  allTerminalsFor(range) {
    return actuals.get(this).agast.allTerminalsFor(range);
  }

  getCooked(range) {
    return actuals.get(this).agast.getCooked(range);
  }

  reifyExpression(value) {
    return actuals.get(this).agast.reifyExpression(value);
  }

  getProperty(node, name) {
    return actuals.get(this).agast.getProperty(node, name);
  }

  sourceTextFor(range) {
    return actuals.get(this).agast.sourceTextFor(range);
  }

  nodeForTag(tag) {
    return actuals.get(this).agast.nodeForTag(tag);
  }

  unbox(value) {
    return actuals.get(this).agast.unbox(value);
  }
};

export const Context = class BABLRContext {
  static from(agastContext, languages, productionEnhancer) {
    return new Context(agastContext, languages, productionEnhancer);
  }

  constructor(agastContext, languages, productionEnhancer) {
    this.agast = agastContext;
    this.languages = languages;
    this.productionEnhancer = productionEnhancer;

    this.grammars = new WeakMap();
    this.facade = new ContextFacade();

    for (const { 1: language } of this.languages) {
      this.grammars.set(language, new language.grammar());
    }

    facades.set(this, this.facade);
  }
};
