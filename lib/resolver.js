const { _, _actual } = require('./symbols.js');

const { isArray } = Array;

class ResolverFacade {
  constructor(resolver, writable = true) {
    this[_] = { resolver, writable };
  }

  static from(node) {
    return new ResolverFacade(new Resolver(node));
  }

  get [_actual]() {
    if (!this[_].writable) {
      this[_].writable = true;
      this[_].resolver = this[_].resolver.branch();
    }
    return this[_].resolver;
  }

  get node() {
    return this[_].resolver.node;
  }

  branch(node = this.node) {
    const { resolver } = this[_];
    return node === this.node
      ? new ResolverFacade(resolver, false)
      : new ResolverFacade(resolver.branch(node));
  }

  accept(resolver) {
    if (resolver[_].resolver !== this[_].resolver) {
      this[_actual].accept(resolver);
    }
    return this;
  }

  resolve(name) {
    return this[_].resolver.resolve(name);
  }
}

class Resolver {
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

module.exports = { Resolver, ResolverFacade };
