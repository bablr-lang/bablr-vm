import { findRight } from './utils/array.js';
import { freezeSeal } from './utils/object.js';
import { _actual } from './symbols.js';
import { facades } from './facades.js';

const skipLevels = 3;
const skipShiftExponentGrowth = 4;
const skipAmounts = new Array(skipLevels)
  .fill(null)
  .map((_, i) => 2 >> (i * skipShiftExponentGrowth));
const skipsByPath = new WeakMap();

export class PathFacade {
  constructor(actual) {
    this[_actual] = actual;

    freezeSeal(this);
  }

  static from(node, refToken, parent) {
    return new PathFacade(new Path(node, refToken, parent));
  }

  get parent() {
    return facades.get(this[_actual].parent);
  }

  get node() {
    return this[_actual].node;
  }

  get parentNode() {
    return this[_actual].parent?.node;
  }

  get parentProperty() {
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

export class Path {
  constructor(node, refToken = null, parent = null) {
    if (!node.type) {
      throw new Error('Invalid node: missing type');
    }

    this.parent = parent;
    this.depth = parent ? parent.depth + 1 : 0;
    this.node = node;
    this.refToken = refToken;

    facades.set(this, new PathFacade(this));

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
      parent = (skips && findRight(skips, (skip) => d - skip > depth)) || parent.parent;
      d = parent.depth;
    }
    return parent;
  }
}
