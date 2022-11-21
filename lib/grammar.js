import { freezeSeal } from './utils/object.js';
import { _actual } from './symbols.js';
import { cstNodesByRef } from './cst.js';
import { facades } from './facades.js';

export class Grammar {
  constructor(actual) {
    this[_actual] = actual;

    freezeSeal(this);
  }

  get base() {
    return facades.get(this[_actual].base) || undefined;
  }

  get context() {
    return this[_actual].context;
  }

  get size() {
    return this[_actual].size || 0;
  }

  nodeForRef(ref) {
    return cstNodesByRef.get(ref) || undefined;
  }

  has(type) {
    return this[_actual].has(type) || false;
  }

  get(type) {
    return this[_actual].get(type) || undefined;
  }

  set(type, value) {
    this[_actual].set(type, value);
    return this;
  }

  delete(type) {
    this[_actual].delete(type);
    return this;
  }

  is(type, node) {
    return this[_actual].is(type, node);
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
    this[_actual][Symbol.iterator]();
  }
}
