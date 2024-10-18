import { parsePath } from '@bablr/agast-helpers/path';
import { ReferenceTag } from '@bablr/agast-helpers/symbols';
import {
  buildGapTag,
  buildStubNode,
  get,
  getCloseTag,
  getOpenTag,
} from '@bablr/agast-helpers/tree';
import * as btree from '@bablr/agast-helpers/btree';

const { hasOwn } = Object;

export const contexts = new WeakMap();
export const actuals = new WeakMap();
// eslint-disable-next-line no-undef
export const transparentFacades = new WeakSet();

export const NodeFacade = class BABLRNodeFacade {
  static wrap(node, context, transparent) {
    if (!node || !context) throw new Error();
    return node && new NodeFacade(node, context, transparent);
  }

  constructor(node, context, transparent) {
    actuals.set(this, node);
    contexts.set(this, context);
    if (transparent) {
      transparentFacades.add(this);
    }
  }

  get isTransparent() {
    return transparentFacades.has(this);
  }

  get children() {
    const node = actuals.get(this);
    const isTransparent = transparentFacades.has(this);
    return {
      *[Symbol.iterator]() {
        if (isTransparent) {
          yield* btree.traverse(node.children);
        } else {
          for (const child of btree.traverse(node.children)) {
            const interpolated = false; // TODO
            if (!interpolated) {
              yield child;
            }
          }
        }
      },
    };
  }

  get flags() {
    return actuals.get(this).flags;
  }

  get language() {
    return actuals.get(this).language;
  }

  get type() {
    return actuals.get(this).type;
  }

  get attributes() {
    return actuals.get(this).attributes;
  }

  get openTag() {
    return getOpenTag(actuals.get(this));
  }

  get closeTag() {
    return getCloseTag(actuals.get(this));
  }

  get(path) {
    const context = contexts.get(this);
    const node = get(actuals.get(this), path);
    const isTransparent = transparentFacades.has(this);

    const ref = node && context.agast.getPreviousTag(btree.getAt(0, node.children));
    const node_ =
      (ref && ref.type === ReferenceTag && !ref.value.hasGap) || isTransparent
        ? node
        : buildStubNode(buildGapTag());

    return node && NodeFacade.wrap(node_, context, isTransparent);
  }

  has(path) {
    return hasOwn(actuals.get(this).properties, parsePath(path).name);
  }
};
