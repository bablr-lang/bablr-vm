const { isArray } = require('./array.js');

class RefResolver {
  constructor(node) {
    this.node = node;
    this.counters = Object.create(null); // {[property]: counter}
  }

  resolve(referenceToken) {
    const { node, counters } = this;
    const { value: name } = referenceToken;

    let path = name;

    if (isArray(node[name])) {
      const count = counters[name] || 0;
      path += '.' + count;
      counters[name] = count + 1;
    }
    return path;
  }

  fork() {
    const fork = new RefResolver(this.node);
    Object.assign(fork.counters, this.counters);
    return fork;
  }
}

module.exports = { RefResolver };
