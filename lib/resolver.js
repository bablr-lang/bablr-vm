const { isArray } = Array;
const _ = Symbol('private');

class ResolverFacade {
  constructor(resolver) {
    this[_] = resolver;
    if (resolver.facade) {
      throw new Error('A resolver can have only one facade');
    }
    resolver.facade = this;
  }

  get node() {
    return this[_].node;
  }

  resolve(name) {
    return this[_].resolve(name);
  }
}

class Resolver {
  constructor(node, counters = Object.create(null)) {
    this.node = node;
    this.counters = counters; // {[property]: counter}

    this.facade = new ResolverFacade(this);
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
    const branched = new Resolver(node);

    if (this.node === node) {
      Object.assign(branched.counters, this.counters);
    }

    return branched;
  }

  accept(resolver) {
    if (resolver.node === this.node) {
      this.counters = resolver.counters;
    }
    return this;
  }
}

module.exports = { Resolver };
