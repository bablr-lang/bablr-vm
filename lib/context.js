import { facades, actuals } from './facades.js';

export class ContextFacade {
  get language() {
    return actuals.get(this).language;
  }

  get grammar() {
    return actuals.get(this).grammar;
  }

  get agast() {
    return actuals.get(this).agast;
  }

  getInnerText(range) {
    return actuals.get(this).agast.getInnerText(range);
  }

  getPreviousTerminal(token) {
    return actuals.get(this).agast.prevTerminals.get(token);
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

  unbox(value) {
    return actuals.get(this).agast.unbox(value);
  }
}

export class Context {
  static from(agastContext, language) {
    return new Context(agastContext, language);
  }

  constructor(agastContext, language) {
    this.agast = agastContext;
    this.language = language;
    this.grammar = new language.grammar();
    this.facade = new ContextFacade();

    facades.set(this, this.facade);
  }
}
