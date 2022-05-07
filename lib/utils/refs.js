const { isArray } = require('./array');

class RefResolver {
  constructor(node) {
    this.node = node;
    this.counters = Object.create(null); // {[property]: counter}
  }

  resolve(referenceToken) {
    const { node, counters } = this;
    const { value: name } = referenceToken;

    let referenced = node[name];

    if (isArray(referenced)) {
      const count = counters[name] || 0;
      referenced = referenced[count];
      counters[name] = count + 1;
    }

    return referenced;
  }
}

module.exports = { RefResolver };
