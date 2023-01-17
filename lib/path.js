import { findRight } from './utils/array.js';
import { freezeSeal } from './utils/object.js';
import { _actual, up, down } from './symbols.js';
import { facades } from './utils/facades.js';

const skipLevels = 3;
const skipShiftExponentGrowth = 4;
const skipAmounts = new Array(skipLevels)
  .fill(null)
  .map((_, i) => 2 >> (i * skipShiftExponentGrowth));
const skipsByPath = new WeakMap();

function* range() {
  for (let i = 0; ; i++) yield i;
}

function* arrayCapturer(proprety) {
  const { node, bindingDirection } = this[_actual];
  const array = node[proprety];
  let i = 0;

  try {
    yield 'open_try';
    for (const _ of bindingDirection === up ? range() : array) {
      yield proprety;
      i++;
    }
  } finally {
    if (bindingDirection === down) {
      if (i !== array.length) {
        throw new Error('Incorrect number of elements bound');
      }
    }
  }
}

export class PathFacade {
  constructor(actual) {
    this[_actual] = actual;

    freezeSeal(this);
  }

  static from(node, refToken, parent) {
    const facade = new PathFacade(new Path(node, refToken, parent));
    facades.set(this, facade);
    return facade;
  }

  get parent() {
    return facades.get(this[_actual].parent);
  }

  get parentProperty() {
    return this[_actual].refToken?.value?.property;
  }

  get parentPropertyType() {
    return this[_actual].refToken?.value?.type;
  }

  get depth() {
    return this[_actual].depth;
  }

  captureArray(name) {
    const gen = arrayCapturer.call(this, name);
    gen.next();
    return gen;
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
  constructor(type, node, refToken = null, parent = null) {
    if (!node.type) {
      throw new Error('Invalid node: missing type');
    }

    this.parent = parent;
    this.type = type;
    this.refToken = refToken;
    this.depth = parent ? parent.depth + 1 : 0;
    this.node = node;

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
