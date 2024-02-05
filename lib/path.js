import { WeakStackFrame } from '@bablr/weak-stack';
import { findRight } from './utils/array.js';
import { hasOwn } from './utils/object.js';
import { facades, actuals } from './utils/facades.js';
import { Resolver } from './resolver.js';

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

    if (depth > this.depth) throw new Error();

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
    return Path.create(context, null);
  }

  constructor(
    context,
    reference,
    range = [null, null],
    resolver = new Resolver(),
    unboundAttributes = null,
  ) {
    super();

    this.context = context;
    this.reference = reference;
    this.range = range;
    this.resolver = resolver;
    this.unboundAttributes = unboundAttributes;

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

  get startTag() {
    return this.range[0];
  }

  get endTag() {
    return this.range[1];
  }

  get type() {
    return this.startTag?.value?.type || null;
  }

  get balanced() {
    return !!this.startTag?.value?.attributes.balanced;
  }

  get balancer() {
    return !!this.startTag?.value?.attributes.balancer;
  }

  get spanInside() {
    return this.startTag?.value?.attributes.span;
  }

  get spanBetween() {
    return this.startTag?.value?.attributes.lexicalSpan;
  }

  pushTag(tag) {
    const { context } = this;
    const { grammar } = context;

    switch (tag.type) {
      case 'Reference': {
        return this.push(new Path(context, tag));
      }

      case 'OpenFragmentTag':
      case 'OpenNodeTag': {
        if (this.range[0]) throw new Error();

        this.range[0] = tag;
        this.unboundAttributes = new Set(
          hasOwn(grammar, 'unboundAttributes') && tag.value
            ? grammar.unboundAttributes.get(tag.value.type) || []
            : [],
        );

        return this;
      }

      case 'CloseNodeTag': {
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

    if (depth > this.depth) throw new Error();

    let d = this.depth;
    for (; d > depth; ) {
      const skips = skipsByPath.get(this);
      parent = (skips && findRight(skips, (skip) => d - skip > depth)) || parent.parent;
      d = parent.depth;
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

  branch() {
    const { context, reference, range, resolver, unboundAttributes } = this;

    const path = new Path(
      context,
      reference,
      [...range],
      resolver.branch(),
      new Set(unboundAttributes),
    );

    return this.replace(path);
  }

  accept(path) {
    this.range[0] = path.range[0];
    this.range[1] = path.range[1];

    this.resolver.accept(path.resolver);

    this.unboundAttributes = path.unboundAttributes;

    return this;
  }
}
