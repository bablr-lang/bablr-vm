import { findRight } from './utils/array.js';
import { WeakStackFrame } from './utils/object.js';
import { formatType } from './utils/format.js';
import { facades, actuals } from './utils/facades.js';
import * as sym from './symbols.js';

const skipLevels = 3;
const skipShiftExponentGrowth = 4;
const skipAmounts = new Array(skipLevels)
  .fill(null)
  .map((_, i) => 2 >> (i * skipShiftExponentGrowth));
const skipsByPath = new WeakMap();

export class PathFacade {
  constructor(path) {
    facades.set(path, this);
  }

  get type() {
    return actuals.get(this).node.type;
  }

  get parent() {
    return facades.get(actuals.get(this).parent);
  }

  get parentProperty() {
    return actuals.get(this).parentProperty;
  }

  get parentPropertyType() {
    return actuals.get(this).parentPropertyType;
  }

  get depth() {
    return actuals.get(this).depth;
  }

  at(depth) {
    let parent = this;

    let d = actuals.get(parent).depth;
    for (; d > depth; ) {
      const skips = skipsByPath.get(actuals.get(this));
      parent = (skips && findRight(skips, (skip) => d - skip > depth)) || parent.parent;
      d = actuals.get(parent).depth;
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

export class Path extends WeakStackFrame {
  static from(context, node, parentProperty, parentPropertyType) {
    const nodeGrammar = context.grammars.get(sym.node);
    const path = new Path(context, node, parentProperty, parentPropertyType);

    if (node && parentPropertyType && !nodeGrammar.is(parentPropertyType, node.type)) {
      // prettier-ignore
      throw new Error(`Node of {type: ${formatType(node.type)}} is not valid in property of {type: ${formatType(parentPropertyType)}}`);
    }

    return path;
  }

  constructor(context, node, parentProperty = null, parentPropertyType = null) {
    super();

    this.context = context;
    this.node = node; // can be null!
    this.parentProperty = parentProperty;
    this.parentPropertyType = parentPropertyType;

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

    new PathFacade(this);
  }

  get stack() {
    return this.context.paths;
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
