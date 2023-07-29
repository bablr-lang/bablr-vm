import { WeakStack, objectEntries } from './utils/object.js';
import { facades, actuals } from './utils/facades.js';
import { GrammarFacade } from './grammar.js';
import * as sym from './symbols.js';

export class ContextFacade {
  constructor(context) {
    facades.set(context, this);
  }

  static from(language) {
    return new ContextFacade(Context.from(language));
  }

  getPreviousToken(token) {
    return actuals.get(this).prevTags.get(token);
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
    const grammars = (this.grammars = new Map(objectEntries(language.grammars)));

    const nodeGrammar = grammars.get(sym.node);
    const tokenGrammar = grammars.get(sym.token);

    if (!nodeGrammar.aliases.has('Node')) {
      throw new Error('A Node alias is required');
    }

    if (!tokenGrammar.aliases.has('Token')) {
      throw new Error('A Token alias is required');
    }

    new GrammarFacade(nodeGrammar);
    new GrammarFacade(tokenGrammar);

    this.prevTags = new WeakMap();
    this.nextTags = new WeakMap();
    this.tagPairs = new WeakMap();
    this.matchers = new WeakMap();

    this.engines = new WeakStack();
    this.matches = new WeakStack();
    this.states = new WeakStack();
    this.sources = new WeakStack();
    this.paths = new WeakStack();

    new ContextFacade(this);
  }

  *ownTagsFor(range) {
    if (!range) return;

    const { prevTags, tagPairs } = this;
    const { 0: start, 1: end } = range;
    const prev = prevTags.get(start);

    for (let tag = end; tag !== prev; tag = prevTags.get(tag)) {
      if (tag.type === 'CloseTag') {
        tag = prevTags.get(tagPairs.get(tag));
      }

      yield tag;
    }
  }

  *allTagsFor(range) {
    if (!range) return;

    const { prevTags } = this;
    const { 0: start, 1: end } = range;
    const prev = prevTags.get(start);

    for (let tag = end; tag !== prev; tag = prevTags.get(tag)) {
      yield tag;
    }
  }
}
