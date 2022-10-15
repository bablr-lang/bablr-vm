const { _actual } = require('./symbols.js');

class PathFacade {
  constructor(path) {
    this[_actual] = path;
  }

  static from(node, refToken, parent, parentState) {
    return new PathFacade(new Path(node, refToken, parent, parentState));
  }

  get parentState() {
    return this[_actual].parentState;
  }
  get parent() {
    return this[_actual].parent;
  }
  get node() {
    return this[_actual].node;
  }
  get parentNode() {
    return this[_actual].parent?.node;
  }
}

class Path {
  constructor(node, refToken, parent = undefined, parentState = undefined) {
    if (!node.type) {
      throw new Error('Invalid node: missing type');
    }

    this.parentState = parentState;
    this.parent = parent;
    this.node = node;
    this.refToken = refToken;
    this.co = undefined;
    this.matchNode = undefined;
  }
}

module.exports = { Path, PathFacade };
