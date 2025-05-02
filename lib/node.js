import {
  buildCloseNodeTag,
  buildGapTag,
  buildOpenNodeTag,
  buildReferenceTag,
  buildStubNode,
  fragmentFlags,
  isNullNode,
} from '@bablr/agast-helpers/tree';
import { NullTag, OpenNodeTag, ReferenceTag } from '@bablr/agast-helpers/symbols';
import { buildFullRange } from '@bablr/agast-helpers/path';
import * as btree from '@bablr/agast-helpers/btree';
import { isArray } from '@bablr/helpers/object';

export const states = new WeakMap();

export const isFragmentNode = (node) => {
  return node.type === null && node.sigilTag.type === OpenNodeTag;
};

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
    isFragmentFacade = true,
    childrenIndexRange = null,
    dotPropertyReference = null,
    dotPropertyIndex = null,
  ) {
    if (!node) throw new Error();

    if (childrenIndexRange && (childrenIndexRange[0] == null || !childrenIndexRange[1] == null)) {
      throw new Error();
    }

    if (!context) throw new Error();

    if (dotPropertyReference && !node.properties.at(dotPropertyReference.value.name))
      throw new Error();

    if (dotPropertyReference?.value.isArray && dotPropertyIndex == null) throw new Error();

    let resolvedNode = node;
    let fragmentNode = node;

    if (dotPropertyReference) {
      let { name } = dotPropertyReference.value;

      resolvedNode = fragmentNode.get(dotPropertyIndex == null ? name : [name, dotPropertyIndex]);
    }

    states.set(this, {
      context,
      openTag: buildOpenNodeTag(fragmentFlags),
      closeTag: buildCloseNodeTag(),
      node: resolvedNode,
      fragmentNode,
      transparent,
      isFragmentFacade,
      childrenIndexRange,
      dotPropertyReference,
      dotPropertyIndex,
    });

    Object.freeze(this);
  }

  get dotPropertyName() {
    return states.get(this).dotPropertyReference?.value.name;
  }

  get isTransparent() {
    return states.get(this).transparent;
  }

  get isNull() {
    let { node } = states.get(this);
    return node.sigilTag.type === NullTag;
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
            yield node.children.at(i);
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
      let tag = node.children.at(i);
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

    return openTag?.value.flags;
  }

  get language() {
    let { openTag } = this;

    return openTag?.value.language;
  }

  get type() {
    let { openTag } = this;

    return openTag?.value.type;
  }

  get attributes() {
    let { openTag } = this;

    return openTag?.value.attributes;
  }

  get openTag() {
    const { node, openTag, isFragmentFacade } = states.get(this);

    return isFragmentNode(node)
      ? node.children.at(1)
      : isFragmentFacade
      ? openTag
      : node.children.at(0);
  }

  get closeTag() {
    const { node, closeTag, isFragmentFacade } = states.get(this);

    return isFragmentFacade
      ? isFragmentNode(node)
        ? node.closeTag
        : closeTag
      : node.children.at(-1);
  }

  merge(targetFragment) {
    let {
      fragmentNode,
      context,
      transparent,
      isFragmentFacade,
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
        isFragmentFacade,
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
      isFragmentFacade,
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
          index = btree.getSize(node.properties.at(name)) + index;
        }
        i++;
      } else {
        node = node.get(path[i]);
        if (node?.sigilTag.type === NullTag) {
          node = null;
        }
      }

      if (!node) break;
      let refIndex = outerNode.getPropertyChildrenIndex(null, name, index);
      childrenIndexRange = [refIndex, refIndex + 1];

      let boundNode = outerNode.properties.at(name, index);
      let boundRef = outerNode.properties.referenceAt(name, index);

      if (!boundNode) return null;

      ref = boundRef;

      node =
        (ref && ref.type === ReferenceTag && !ref.value.flags.hasGap) || transparent
          ? boundNode
          : buildStubNode(buildGapTag());
    }

    return !node || isNullNode(node)
      ? null
      : new FragmentFacade(
          outerNode,
          context,
          transparent,
          isFragmentFacade,
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
        node = node.properties.at(path.i, path_[i + 1]);
      } else {
        node = node.properties.at(path.i);
      }
    }

    return node.properties.has(path_[path_.length - 1]);
  }

  hasRoot() {
    return this.type != null ? false : !!states.get(this).node.get([buildReferenceTag('.')]);
  }
};

Object.seal(FragmentFacade);
