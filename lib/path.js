const _ = Symbol('private');

class PathFacade {
  constructor(path) {
    this[_] = path;
    if (path.facade) {
      throw new Error('A path can have only one facade');
    }
    path.facade = this;
  }

  get parentState() {
    return this[_].parentState?.facade;
  }
  get parent() {
    return this[_].parent?.facade;
  }
  get node() {
    return this[_].node;
  }
  get parentNode() {
    return this[_].parent?.node;
  }
}

class Path {
  constructor(node, context, parent = undefined, parentState = undefined) {
    if (!node.type) {
      throw new Error('Invalid node');
    }

    this.parentState = parentState;
    this.parent = parent;
    this.node = node;
    this.context = context;
    this.matchNode = {
      node,
      cstTokens: [],
    };
    this.co = undefined;

    this.facade = new PathFacade(this);
  }
}

module.exports = { Path };
