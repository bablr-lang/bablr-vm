const { isArray } = Array;

export class Resolver {
  static from(node) {
    return new Resolver(node);
  }

  constructor(node, parent = null) {
    this.node = node;
    this.parent = parent;
    this.counters = new Map(parent && parent.node === this.node ? parent.counters : undefined);
  }

  consume(name) {
    const { node, counters } = this;

    let path = name;

    if (isArray(node[name])) {
      const count = counters.get(name) || 0;

      path += '.' + count;
      counters.set(name, count + 1);
    }
    return path;
  }

  resolve(name) {
    const { node, counters } = this;

    let path = name;

    if (isArray(node[name])) {
      const count = counters.get(name) || 0;

      path += '.' + count;
    }

    return path;
  }

  branch(node = this.node) {
    return new Resolver(node, this);
  }

  accept() {
    const { parent } = this;

    if (parent && parent.node === this.node) {
      parent.counters = this.counters;
    }

    return parent;
  }
}
