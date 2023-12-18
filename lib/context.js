import { WeakStack } from './utils/object.js';
import { reifyExpressionShallow } from './utils/instruction.js';
import { facades, actuals } from './utils/facades.js';
import { printTerminal } from './print.js';

export class ContextFacade {
  constructor(context) {
    facades.set(context, this);
  }

  static from(language) {
    return new ContextFacade(Context.from(language));
  }

  getInnerText(range) {
    return actuals.get(this).getInnerText(range);
  }

  getPreviousTerminal(token) {
    return actuals.get(this).prevTerminals.get(token);
  }

  ownTerminalsFor(range) {
    return actuals.get(this).ownTerminalsFor(range);
  }

  allTerminalsFor(range) {
    return actuals.get(this).allTerminalsFor(range);
  }

  getGrammar(type) {
    return actuals.get(this).grammars.get(type);
  }

  unbox(value) {
    return actuals.get(this).unbox(value);
  }
}

export class Context {
  static from(language) {
    return new Context(language);
  }

  constructor(language) {
    const { grammar: Grammar } = language;

    this.language = language;
    this.grammar = new Grammar();

    this.prevTerminals = new WeakMap();
    this.nextTerminals = new WeakMap();
    this.tagPairs = new WeakMap();
    this.unboxedValues = new WeakMap();

    this.matches = new WeakStack();
    this.states = new WeakStack();
    this.sources = new WeakStack();
    this.paths = new WeakStack();

    new ContextFacade(this);
  }

  getInnerText(range) {
    let text = '';
    for (const terminal of this.allTerminalsFor(range)) {
      if (['Literal', 'Escape', 'Trivia'].includes(terminal.type)) {
        text += printTerminal(terminal);
      }
    }
    return text;
  }

  *ownTerminalsFor(range) {
    if (!range) return;

    const { nextTerminals, tagPairs } = this;
    let { 0: start, 1: end } = range;

    if (start.type === 'OpenNode') {
      if (end.type !== 'CloseNode') throw new Error();

      start = nextTerminals.get(start);
    } else {
      end = nextTerminals.get(end);
    }

    for (let term = start; term !== end; term = nextTerminals.get(term)) {
      if (term.type === 'OpenNode') {
        term = nextTerminals.get(tagPairs.get(term));
      }

      yield term;
    }
  }

  *allTerminalsFor(range) {
    if (!range) return;

    const { nextTerminals } = this;
    let { 0: start, 1: end } = range;

    if (start.type === 'OpenNode') {
      if (end.type !== 'CloseNode') throw new Error();

      start = nextTerminals.get(start);
    } else {
      end = nextTerminals.get(end);
    }

    for (let tag = start; tag !== end; tag = nextTerminals.get(tag)) {
      yield tag;
    }
  }

  *ownTerminalsReverseFor(range) {
    if (!range) return;

    const { prevTerminals, tagPairs } = this;
    let { 0: start, 1: end } = range;

    if (start.type === 'OpenNode') {
      if (end.type !== 'CloseNode') throw new Error();

      end = prevTerminals.get(end);
    } else {
      start = prevTerminals.get(start);
    }

    for (let term = end; term !== start; term = prevTerminals.get(term)) {
      if (term.type === 'CloseNode') {
        term = prevTerminals.get(tagPairs.get(term));
      }

      yield term;
    }
  }

  *allTerminalsReverseFor(range) {
    if (!range) return;

    const { prevTerminals } = this;
    let { 0: start, 1: end } = range;

    if (start.type === 'OpenNode') {
      if (end.type !== 'CloseNode') throw new Error();

      end = prevTerminals.get(end);
    } else {
      start = prevTerminals.get(start);
    }

    for (let tag = end; tag !== start; tag = prevTerminals.get(tag)) {
      yield tag;
    }
  }

  unbox(value) {
    const { unboxedValues } = this;
    if (!unboxedValues.has(value)) {
      unboxedValues.set(value, reifyExpressionShallow(value));
    }

    return unboxedValues.get(value);
  }
}
