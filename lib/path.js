class PathNode {
  constructor(node, parent) {
    this.node = node;
    this.parent = parent;
  }

  get parentNode() {
    return this.parent?.node;
  }
}

module.exports = { PathNode };
