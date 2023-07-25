import { findRight } from './utils/array.js';
import { WeakStackFrame } from './utils/object.js';
import { facades, actuals } from './utils/facades.js';

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
    return actuals.get(this).element.type;
  }

  get gapType() {
    return actuals.get(this).element.gapType;
  }

  get segment() {
    return actuals.get(this).element.attrs.path;
  }

  get parent() {
    return facades.get(actuals.get(this).parent);
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
  static from(context, element) {
    const path = new Path(context, element);
    path.stack.push(null, path);
    return path;
  }

  constructor(context, element) {
    super();

    this.context = context;
    this.element = element;

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

  get isGap() {
    return this.element.isGap;
  }

  get gapType() {
    return this.element.gapType;
  }

  get type() {
    return this.element.type;
  }

  get segment() {
    return this.element.attrs?.path;
  }

  push(path) {
    if (this.isGap) throw new Error('Gap path cannot have children');
    return super.push(path);
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
