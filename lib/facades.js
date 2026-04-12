import * as Tags from '@bablr/agast-helpers/tags';
import { buildGapTag, buildPropertyTag } from '@bablr/agast-helpers/builders';
import { buildFacadeLayer } from '@bablr/agast-vm-helpers/facades';
import { buildNode, isStubNode } from '@bablr/agast-helpers/path';
import { GapNode, Property } from '@bablr/agast-helpers/symbols';
import { isObject } from '@bablr/agast-helpers/object';

export const { facades, actuals } = buildFacadeLayer();

let gapNodes = new WeakMap();

export const getGapNode = (node) => {
  return node.type === GapNode ? gapNodes.get(node) || node : node;
};

export const buildFacadeNode = (reference, node) => {
  if (!node) return null;
  if (reference?.flags.hasGap) return buildNode(buildGapTag());

  let facadeTags = Tags.fromValues([]);

  if (isStubNode(node)) {
    return node;
  }

  for (let tag of Tags.traverse(Tags.getTags(node))) {
    if (isObject(tag) && tag.type === Property) {
      let property = tag;
      let { reference, shift, node, tags } = property.value;

      let tags_;
      if (reference?.flags.intrinsic || ['_', '#', '@'].includes(reference?.type)) {
        tags_ = Tags.fromValues([tags[1][0], tags[1][1], buildFacadeNode(reference, node)]);
      } else {
        let gapNode = buildNode(buildGapTag());
        if (!reference?.flags.hasGap) {
          gapNodes.set(gapNode, node);
        }

        tags_ = Tags.fromValues([tags[1][0], tags[1][1], gapNode]);
      }

      facadeTags = Tags.push(buildPropertyTag(tags_, shift), facadeTags);
    } else {
      facadeTags = Tags.push(tag, facadeTags);
    }
  }

  return buildNode(facadeTags);
};
