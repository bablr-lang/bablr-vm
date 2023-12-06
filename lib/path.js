import { findRight } from './utils/array.js';
import { WeakStackFrame } from './utils/object.js';
import { facades, actuals } from './utils/facades.js';
import { getCooked } from './utils/token.js';

export { PathResolver } from '@bablr/boot-helpers/path';

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
    return actuals.get(this).type;
  }

  get gapType() {
    return actuals.get(this).gapType;
  }

  get name() {
    return actuals.get(this).name;
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
  static from(context) {
    const path = new Path(context, null);
    path.stack.push(null, path);
    return path;
  }

  constructor(context, reference) {
    super();

    this.context = context;
    this.reference = reference;

    this.range = [];

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

  get tag() {
    return this.range[0];
  }

  get type() {
    return this.tag.value.type;
  }

  pushTag(tag) {
    const { context } = this;

    switch (tag.type) {
      case 'Reference': {
        const path = new Path(context, tag);

        this.push(path);

        return path;
      }

      case 'OpenNode': {
        if (this.range[0]) throw new Error();

        this.range[0] = tag;

        return this;
      }

      case 'CloseNode': {
        if (!this.range[0]) throw new Error();
        if (this.range[1]) throw new Error();

        this.range[1] = tag;

        return this.parent;
      }

      default:
        throw new Error();
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
