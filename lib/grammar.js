import { facades } from './utils/facades.js';

export class GrammarFacade {
  constructor(grammar) {
    facades.set(grammar, this);
  }

  get aliases() {
    return facades.get(this).aliases;
  }

  get size() {
    return facades.get(this).size;
  }

  has(type) {
    return facades.get(this).has(type);
  }

  get(type) {
    return facades.get(this).get(type);
  }

  is(supertype, type) {
    return facades.get(this).is(supertype, type);
  }

  keys() {
    return facades.get(this).keys();
  }

  values() {
    return facades.get(this).values();
  }

  entries() {
    return facades.get(this).entries();
  }

  forEach(fn) {
    facades.get(this).forEach(fn);
  }

  [Symbol.iterator]() {
    return facades.get(this)[Symbol.iterator]();
  }
}
