import map from 'iter-tools-es/methods/map';
import { WeakStack, objectEntries } from './utils/object.js';
import { facades, actuals } from './utils/facades.js';

export class ContextFacade {
  constructor(context) {
    facades.set(context, this);
  }

  static from(language) {
    return new ContextFacade(Context.from(language));
  }

  getPreviousTerminal(token) {
    return actuals.get(this).prevTerminals.get(token);
  }

  getGrammar(type) {
    return actuals.get(this).grammars.get(type);
  }
}

export class Context {
  static from(language) {
    return new Context(language);
  }

  constructor(language) {
    const { grammar: Grammar } = language;

    this.grammar = new Grammar();

    this.prevTerminals = new WeakMap();
    this.nextTerminals = new WeakMap();
    this.tagPairs = new WeakMap();

    this.matches = new WeakStack();
    this.states = new WeakStack();
    this.sources = new WeakStack();
    this.paths = new WeakStack();
    this.coroutines = new WeakStack();

    new ContextFacade(this);
  }

  *ownTagsFor(range) {
    if (!range) return;

    const { prevTerminals, tagPairs } = this;
    const { 0: start, 1: end } = range;
    const prev = prevTerminals.get(start);

    for (let tag = end; tag !== prev; tag = prevTerminals.get(tag)) {
      if (tag.type === 'CloseTag') {
        tag = prevTerminals.get(tagPairs.get(tag));
      }

      yield tag;
    }
  }

  *allTagsFor(range) {
    if (!range) return;

    const { prevTerminals } = this;
    const { 0: start, 1: end } = range;
    const prev = prevTerminals.get(start);

    for (let tag = end; tag !== prev; tag = prevTerminals.get(tag)) {
      yield tag;
    }
  }
}
