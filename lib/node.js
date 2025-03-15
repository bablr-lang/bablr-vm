import {
  buildCloseNodeTag,
  buildGapTag,
  buildOpenNodeTag,
  buildReferenceTag,
  buildStubNode,
  isNullNode,
  parseReference,
} from '@bablr/agast-helpers/tree';
import { getStreamIterator } from '@bablr/agast-helpers/stream';
import { agast } from '@bablr/agast-vm';
import * as btree from '@bablr/agast-helpers/btree';
import { Pump } from './utils/pump.js';
import { OpenNodeTag, ReferenceTag } from '@bablr/agast-helpers/symbols';
import { get, getProperties } from '@bablr/agast-helpers/path';
import { isArray } from '@bablr/helpers/object';

export const states = new WeakMap();
export const internalStates = new WeakMap();

const { hasOwn } = Object;

const buildFullRange = (node) => {
  const sum = btree.getSum(node.children);
  return sum ? [0, sum - 1] : null;
};

export const FragmentFacade = class BABLRFragmentFacade {
  static wrap(
    node,
    context,
    transparent = false,
    childrenIndexRange = null,
    dotPropertyReference = null,
    dotPropertyIndex = null,
  ) {
    return (
      node &&
      new FragmentFacade(
        node,
        context,
        transparent,
        true,
        childrenIndexRange,
        dotPropertyReference,
        dotPropertyIndex,
      )
    );
  }

  constructor(
    node,
    context,
    transparent = false,
    isFragmentNode = true,
    childrenIndexRange = null,
    dotPropertyReference = null,
    dotPropertyIndex = null,
  ) {
    if (childrenIndexRange && (childrenIndexRange[0] == null || !childrenIndexRange[1] == null)) {
      throw new Error();
    }

    if (!context) throw new Error();

    if (dotPropertyReference && !hasOwn(node.properties, dotPropertyReference.value.name))
      throw new Error();

    if (isArray(dotPropertyReference?.value.isArray && dotPropertyIndex == null)) throw new Error();

    states.set(this, {
      context,
      openTag: buildOpenNodeTag(),
      closeTag: buildCloseNodeTag(),
      node,
      transparent,
      childrenIndexRange,
      isFragmentNode,
      dotPropertyReference,
      dotPropertyIndex,
    });
  }

  get dotPropertyName() {
    return this.dotPropertyReference?.value.name;
  }

  get isTransparent() {
    return states.get(this).transparent;
  }

  get children() {
    let { node, transparent, childrenIndexRange } = states.get(this);

    childrenIndexRange ??= buildFullRange(node);

    return {
      *[Symbol.iterator]() {
        for (let i = childrenIndexRange[0]; i <= childrenIndexRange[1]; i++) {
          const interpolated = false; // TODO
          if (!interpolated || transparent) {
            yield btree.getAt(i, node.children);
          }
        }
      },
    };
  }

  getRootIndex() {
    const { node, dotPropertyName, childrenIndexRange } = states.get(this);

    if (!childrenIndexRange) return null;

    if (childrenIndexRange[0] > childrenIndexRange[1]) throw new Error();

    for (let i = childrenIndexRange[0]; i <= childrenIndexRange[1]; i++) {
      let tag = btree.getAt(i, node.children);
      if (tag.type === ReferenceTag) {
        const { name, isArray } = tag.value;
        let resolvedTagName = name === '.' ? dotPropertyName : name;

        if (resolvedTagName === dotPropertyName) {
          return i;
        }
      }
    }

    return null;
  }

  get flags() {
    const { openTag } = this;

    return openTag.type === OpenNodeTag ? openTag.value.flags : null;
  }

  get language() {
    let { node, isFragmentNode } = states.get(this);

    return isFragmentNode ? null : node.language;
  }

  get type() {
    let { node, isFragmentNode } = states.get(this);

    return isFragmentNode ? null : node.type;
  }

  get attributes() {
    let { node, isFragmentNode } = states.get(this);

    return isFragmentNode ? {} : node.attributes;
  }

  get openTag() {
    const { node, openTag, isFragmentNode } = states.get(this);

    return isFragmentNode ? openTag : btree.getAt(0, node.children);
  }

  get closeTag() {
    const { node, closeTag, isFragmentNode } = states.get(this);

    return isFragmentNode ? closeTag : btree.getAt(btree.getSum(node.children) - 1, node.children);
  }

  get(path) {
    let {
      node,
      context,
      transparent,
      dotPropertyReference,
      dotPropertyIndex: dotIndex,
    } = states.get(this);
    const parsedRef = parseReference(path);

    if (dotPropertyReference) {
      let { name, isArray, flags } = dotPropertyReference.value;

      let dotReference = buildReferenceTag(name, isArray, flags, dotIndex);

      node = get(dotReference, node);
    }

    if (parsedRef.value.name !== '.') {
      const binding = getProperties(parsedRef, node.properties);

      if (!binding) return null;

      const ref = binding.reference;

      node =
        (ref && ref.type === ReferenceTag && !ref.value.flags.hasGap) || transparent
          ? binding.node
          : buildStubNode(buildGapTag());
    }

    return isNullNode(node)
      ? null
      : new FragmentFacade(
          node,
          context,
          transparent,
          false,
          childrenIndexRange,
          parsedRef,
          parsedRef.value.index,
        );
  }

  has(path) {
    return hasOwn(states.get(this).node.properties, parseReference(path).value.name);
  }
};

Object.seal(FragmentFacade);

export const buildInternalState = () => {
  let instructionsPump = new Pump();
  let expressionsPump = new Pump();
  let agastState = null;
  let agast_ = getStreamIterator(
    agast(
      (ctx, s) => {
        agastState = s;
        return instructionsPump;
      },
      { expressions: expressionsPump },
    ),
  );
  let internalState = {
    instructionsPump,
    expressionsPump,
    agastState,
    agast: agast_,
    path: agastState.path,
  };
  return internalState;
};
