import {
  buildCloseNodeTag,
  buildGapTag,
  buildOpenNodeTag,
  buildStubNode,
  getRoot,
  isNullNode,
} from '@bablr/agast-helpers/tree';
import * as sumtree from '@bablr/agast-helpers/sumtree';
import { OpenNodeTag, ReferenceTag } from '@bablr/agast-helpers/symbols';
import {
  buildFullRange,
  get,
  getProperties,
  getPropertyChildrenIndex,
  isFragmentNode,
} from '@bablr/agast-helpers/path';
import * as btree from '@bablr/agast-helpers/btree';
import { isArray } from '@bablr/helpers/object';

export const states = new WeakMap();

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
      let { name } = dotPropertyReference.value;

      resolvedNode = get(dotPropertyIndex == null ? name : [name, dotPropertyIndex], fragmentNode);
    }

    states.set(this, {
      context,
      openTag: buildOpenNodeTag(),
      closeTag: buildCloseNodeTag(),
      node: resolvedNode,
      fragmentNode,
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
    let { node } = states.get(this);

    return isFragmentNode(node) ? null : node.language;
  }

  get type() {
    let { node } = states.get(this);

    return isFragmentNode(node) ? null : node.type;
  }

  get attributes() {
    let { node } = states.get(this);

    return isFragmentNode(node) ? {} : node.attributes;
  }

  get openTag() {
    const { node, openTag } = states.get(this);

    return isFragmentNode(node) ? openTag : sumtree.getAt(0, node.children);
  }

  get closeTag() {
    const { node, closeTag } = states.get(this);

    return isFragmentNode(node)
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
      context,
      transparent,
      isFragmentNode,
      childrenIndexRange,
      dotPropertyReference: dotReference,
      dotPropertyIndex: dotIndex,
    } = states.get(this);

    if (typeof path === 'string') {
      path = [path];
    }

    if (!isArray(path)) throw new Error();

    let node = ownNode;
    let ref = dotReference;
    let index = dotIndex;
    let outerNode;

    for (let i = 0; i < path.length; i++) {
      let name = path[i];
      outerNode = node;
      if (Number.isFinite(path[i + 1])) {
        index = path[i + 1];
        if (index < 0) {
          index = btree.getSize(node.properties[name]) + index;
        }
        i++;
      } else {
        node = node.properties[path[i]]?.node;
        if (isNullNode(node)) {
          node = null;
        }
      }

      if (!node) break;
      let refIndex = getPropertyChildrenIndex(outerNode, null, name, index);
      childrenIndexRange = [refIndex, refIndex + 1];

      const binding = getProperties(name, index, outerNode.properties);

      if (!binding) return null;

      ref = binding.reference;

      node =
        (ref && ref.type === ReferenceTag && !ref.value.flags.hasGap) || transparent
          ? binding.node
          : buildStubNode(buildGapTag());
    }

    return !node || isNullNode(node)
      ? null
      : new FragmentFacade(
          outerNode,
          context,
          transparent,
          isFragmentNode,
          childrenIndexRange,
          ref,
          index,
        );
  }

  has(path) {
    let node = states.get(this).node;
    let path_ = path;
    if (typeof path === 'string') {
      path_ = [path];
    }

    if (!isArray(path_)) throw new Error();

    for (let i = 0; i < path_.length - 2; i++) {
      if (i < path_.length - 3 && Number.isFinite(path_[i + 1])) {
        node = btree.getAt(path_[i + 1], node.properties[path_[i]]);
      } else {
        node = node.properties[path_[i]].node;
      }
    }

    return hasOwn(node.properties, path_[path_.length - 1]);
  }

  hasRoot() {
    return this.type != null ? false : getRoot(states.get(this).node);
  }
};

Object.seal(FragmentFacade);
