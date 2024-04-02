import { facades, actuals } from './facades.js';

export const ContextFacade = class BABLRContextFacade {
  get languages() {
    return actuals.get(this).languages;
  }

  get grammars() {
    return actuals.get(this).grammars;
  }

  get agast() {
    return actuals.get(this).agast;
  }

  getInnerText(range) {
    return actuals.get(this).agast.getInnerText(range);
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

  sourceTextFor(range) {
    return actuals.get(this).agast.sourceTextFor(range);
  }

  unbox(value) {
    return actuals.get(this).agast.unbox(value);
  }
};

export const Context = class BABLRContext {
  static from(agastContext, languages) {
    return new Context(agastContext, languages);
  }

  constructor(agastContext, languages) {
    this.agast = agastContext;
    this.languages = languages;
    this.grammars = new WeakMap();
    this.facade = new ContextFacade();

    for (const { 1: language } of this.languages) {
      this.grammars.set(language, new language.grammar());
    }

    facades.set(this, this.facade);
  }
};
