import { findRight } from './utils/array.js';
import { freezeSeal } from './utils/object.js';
import { formatType } from './utils/format.js';
import { _actual, up, down, Fragment } from './symbols.js';
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

  get type() {
    return this[_actual].type;
  }

  get nodeType() {
    return this[_actual].node.type;
  }

  get parent() {
    return facades.get(this[_actual].parent);
  }

  get parentProperty() {
    return this[_actual].parentProperty;
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
  static from(grammar, type, node, parent, parentProperty) {
    const path = new Path(grammar, type, node, parent, parentProperty);
    const facade = new PathFacade(path);

    facades.set(path, facade);

    return path;
  }

  constructor(grammar, type, node = null, parent = null, parentProperty = null) {
    if (!type) {
      throw new Error('Path must have a type');
    }

    if (node && type !== Fragment && !grammar.is(type, node.type)) {
      // prettier-ignore
      throw new Error(`Node of {type: ${formatType(node.type)}} is not valid for path of {type: ${formatType(type)}}`);
    }

    this.type = type;
    this.node = node;
    this.parent = parent;
    this.parentProperty = parentProperty;
    this.depth = parent ? parent.depth + 1 : 0;
    this.range = null;

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
