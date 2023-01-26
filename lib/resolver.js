import { freezeSeal } from './utils/object.js';
import { _actual } from './symbols.js';
import { facades } from './utils/facades.js';

const { isArray } = Array;

export class ResolverFacade {
  constructor(actual) {
    this[_actual] = actual;

    freezeSeal(this);
  }

  get node() {
    return this[_actual].node;
  }

  branch(node = this.node) {
    return new ResolverFacade(this[_actual].branch(node));
  }

  accept(resolver) {
    this[_actual].accept(resolver);

    return this;
  }

  resolve(name) {
    return this[_actual].resolve(name);
  }
}

export class Resolver {
  static from(node) {
    const resolver = new Resolver(node);
    const facade = new ResolverFacade(resolver);

    facades.set(resolver, facade);

    return resolver;
  }

  constructor(node, counters = Object.create(null)) {
    this.node = node;
    this.counters = counters; // {[property]: counter}
  }

  consume(name) {
    const { node, counters } = this;

    let path = name;

    if (isArray(node[name])) {
      const count = counters[name] || 0;

      path += '.' + count;
      counters[name] = count + 1;
    }
    return path;
  }

  resolve(name) {
    const { node, counters } = this;

    let path = name;

    if (isArray(node[name])) {
      const count = counters[name] || 0;

      path += '.' + count;
    }

    return path;
  }

  branch(node = this.node) {
    return new Resolver(node, Object.assign(Object.create(null), this.counters));
  }

  accept(resolver) {
    if (this.node === resolver.node) {
      this.counters = resolver.counters;
    }

    return this;
  }
}
