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
import * as sumtree from '@bablr/agast-helpers/sumtree';
import { Pump } from './utils/pump.js';
import { OpenNodeTag, ReferenceTag } from '@bablr/agast-helpers/symbols';
import {
  buildFullRange,
  get,
  getProperties,
  getPropertyChildrenIndex,
} from '@bablr/agast-helpers/path';
import { isArray } from '@bablr/helpers/object';

export const states = new WeakMap();
export const internalStates = new WeakMap();

const { hasOwn } = Object;

export const FragmentFacade = class BABLRFragmentFacade {
  static wrapNode(
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
        false,
        childrenIndexRange,
        dotPropertyReference,
        dotPropertyIndex,
      )
    );
  }

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
    if (!node) throw new Error();

    if (childrenIndexRange && (childrenIndexRange[0] == null || !childrenIndexRange[1] == null)) {
      throw new Error();
    }

    if (!context) throw new Error();

    if (dotPropertyReference && !hasOwn(node.properties, dotPropertyReference.value.name))
      throw new Error();

    if (isArray(dotPropertyReference?.value.isArray && dotPropertyIndex == null)) throw new Error();

    let resolvedNode = node;
    let fragmentNode = node;

    if (dotPropertyReference) {
      let { name, isArray, flags } = dotPropertyReference.value;

      let dotReference = buildReferenceTag(name, isArray, flags, dotPropertyIndex);

      resolvedNode = get(dotReference, fragmentNode);
    }

    states.set(this, {
      context,
      openTag: buildOpenNodeTag(),
      closeTag: buildCloseNodeTag(),
      node: resolvedNode,
      fragmentNode: node,
      transparent,
      isFragmentNode,
      childrenIndexRange,
      dotPropertyReference,
      dotPropertyIndex,
    });
  }

  get dotPropertyName() {
    return states.get(this).dotPropertyReference?.value.name;
  }

  get isTransparent() {
    return states.get(this).transparent;
  }

  get isNull() {
    let { node } = states.get(this);
    return isNullNode(node);
  }

  get children() {
    let { node, isFragmentNode, transparent, childrenIndexRange } = states.get(this);

    childrenIndexRange =
      isFragmentNode || !childrenIndexRange ? buildFullRange(node) : childrenIndexRange;

    return {
      *[Symbol.iterator]() {
        for (let i = childrenIndexRange[0]; i <= childrenIndexRange[1]; i++) {
          const interpolated = false; // TODO
          if (!interpolated || transparent) {
            yield sumtree.getAt(i, node.children);
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
      let tag = sumtree.getAt(i, node.children);
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

    return isFragmentNode ? openTag : sumtree.getAt(0, node.children);
  }

  get closeTag() {
    const { node, closeTag, isFragmentNode } = states.get(this);

    return isFragmentNode
      ? closeTag
      : sumtree.getAt(sumtree.getSize(node.children) - 1, node.children);
  }

  merge(targetFragment) {
    let {
      fragmentNode,
      context,
      transparent,
      isFragmentNode,
      childrenIndexRange,
      dotPropertyReference,
      dotPropertyIndex,
    } = states.get(this);
    const { fragmentNode: targetFragmentNode, childrenIndexRange: targetChildrenIndexRange } =
      states.get(targetFragment);
    if (fragmentNode === targetFragmentNode) {
      // TODO restrict what is legal here

      return new FragmentFacade(
        fragmentNode,
        context,
        transparent,
        isFragmentNode,
        targetChildrenIndexRange,
        dotPropertyReference,
        dotPropertyIndex,
      );
    } else {
      throw new Error('not implemented');
    }
  }

  get(path) {
    let {
      node: ownNode,
      fragmentNode,
      context,
      transparent,
      isFragmentNode,
      childrenIndexRange,
      dotPropertyReference: dotReference,
      dotPropertyIndex: dotIndex,
    } = states.get(this);
    const parsedRef = parseReference(path);

    let node = fragmentNode;

    if (parsedRef.value.name !== '.') {
      if (dotReference) {
        fragmentNode = ownNode;
        dotReference = parsedRef;

        isFragmentNode = false;
      } else {
        dotReference = parsedRef;
        dotIndex = parsedRef.value.index;
      }

      let { name, isArray, flags } = parsedRef.value;
      let resolvedReference = buildReferenceTag(name, isArray, flags, dotIndex);
      let refIndex = getPropertyChildrenIndex(fragmentNode, resolvedReference);
      childrenIndexRange = [refIndex, refIndex + 1];

      const binding = getProperties(parsedRef, fragmentNode.properties);

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
          fragmentNode,
          context,
          transparent,
          isFragmentNode,
          childrenIndexRange,
          dotReference,
          dotIndex,
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
