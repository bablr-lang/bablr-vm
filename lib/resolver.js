const { isArray } = Array;

export class Resolver {
  static from(node) {
    return new Resolver(node);
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
