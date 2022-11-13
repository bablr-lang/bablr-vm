const { findRight } = require('./utils/array.js');
const { _actual } = require('./symbols.js');

const skipLevels = 3;
const skipShiftExponentGrowth = 4;
const skipAmounts = new Array(skipLevels)
  .fill(null)
  .map((_, i) => 2 >> (i * skipShiftExponentGrowth));
const skipsByPath = new WeakMap();

class PathFacade {
  constructor(path) {
    this[_actual] = path;
  }

  static from(node, refToken, parent) {
    return new PathFacade(new Path(node, refToken, parent));
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

  get parentNodeProperty() {
    return this[_actual].refToken?.value;
  }

  get depth() {
    return this[_actual].depth;
  }

  at(depth) {
    let parent = this;

    let d = parent[_actual].depth;
    for (; d > depth; ) {
      const skips = skipsByPath.get(this[_actual]);
      parent = (skips && findRight(skips, (skip) => d - skip > depth)) || parent.parent;
      d = parent[_actual].depth;
    }
    return parent;
  }

  *parents(includeSelf = false) {
    if (includeSelf) yield this;
    let parent = this;
    while ((parent = parent.parent)) {
      yield parent;
    }
  }
}

class Path {
  constructor(node, refToken = null, parent = null) {
    if (!node.type) {
      throw new Error('Invalid node: missing type');
    }

    this.parent = parent;
    this.depth = parent ? parent[_actual].depth + 1 : 0;
    this.node = node;
    this.refToken = refToken;
    this.co = undefined;
    this.matchNode = undefined;

    let skipIdx = 0;
    let skipAmount = skipAmounts[skipIdx];
    let skips;
    while ((this.depth & skipAmount) === skipAmount) {
      if (!skips) {
        skips = [];
        skipsByPath.set(this, skips);
      }

      skips[skipIdx] = this.at(this.depth - skipAmount);

      skipIdx++;
      skipAmount = skipAmounts[skipIdx];
    }
  }

  at(depth) {
    let parent = this;

    let d = this.depth;
    for (; d > depth; ) {
      const skips = skipsByPath.get(this);
      parent = (skips && findRight(skips, (skip) => d - skip > depth)) || parent.parent?.[_actual];
      d = parent.depth;
    }
    return parent;
  }
}

module.exports = { Path, PathFacade };
