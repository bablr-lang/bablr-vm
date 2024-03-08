import { facades, actuals } from './facades.js';

export class ContextFacade {
  get language() {
    return actuals.get(this).language;
  }

  get grammar() {
    return actuals.get(this).grammar;
  }

  get agast() {
    return actuals.get(this).agast.facade;
  }

  getInnerText(range) {
    return this.agast.getInnerText(range);
  }

  getPreviousTerminal(token) {
    return this.agast.prevTerminals.get(token);
  }

  ownTerminalsFor(range) {
    return this.agast.ownTerminalsFor(range);
  }

  allTerminalsFor(range) {
    return this.agast.allTerminalsFor(range);
  }

  getCooked(range) {
    return this.agast.getCooked(range);
  }

  unbox(value) {
    return this.agast.unbox(value);
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
