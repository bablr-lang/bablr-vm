import { _actual } from './symbols.js';
import { freezeSeal } from './utils/object.js';

export class GrammarFacade {
  constructor(grammar) {
    this[_actual] = grammar;

    freezeSeal(this);
  }

  get aliases() {
    return this[_actual].aliases;
  }

  get size() {
    return this[_actual].size;
  }

  has(type) {
    return this[_actual].has(type);
  }

  get(type) {
    return this[_actual].get(type);
  }

  is(supertype, type) {
    return this[_actual].is(supertype, type);
  }

  keys() {
    return this[_actual].keys();
  }

  values() {
    return this[_actual].values();
  }

  entries() {
    return this[_actual].entries();
  }

  forEach(fn) {
    this[_actual].forEach(fn);
  }

  [Symbol.iterator]() {
    return this[_actual][Symbol.iterator]();
  }
}
