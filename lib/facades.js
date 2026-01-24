import * as Tags from '@bablr/agast-helpers/tags';
import { buildGapTag, buildPropertyTag } from '@bablr/agast-helpers/builders';
import { buildFacadeLayer } from '@bablr/agast-vm-helpers/facades';
import { buildNode, getTags } from '@bablr/agast-helpers/path';
import { Property } from '@bablr/agast-helpers/symbols';

export const { facades, actuals } = buildFacadeLayer();

let gapNodes = new WeakMap();

export const getGapNode = (gap) => gapNodes.get(gap);

export const buildFacadeNode = (node) => {
  if (!node) return null;

  let facadeTags = Tags.fromValues([]);

  for (let tag of Tags.traverse(getTags(node))) {
    if (tag.type === Property) {
      let property = tag;
      let { reference, shift, node, tags } = property.value;

      let tags_;
      if (reference?.flags.intrinsic || reference?.type === '_') {
        tags_ = [tags[0], tags[1], buildFacadeNode(node)];
      } else {
        let gapNode = buildNode(buildGapTag());
        if (!reference?.flags.hasGap) {
          gapNodes.set(gapNode, node);
        }

        tags_ = [tags[0], tags[1], gapNode];
      }

      tags_ = tags_.slice(0, tags.length);

      facadeTags = Tags.push(facadeTags, buildPropertyTag(tags_, shift));
    } else {
      facadeTags = Tags.push(facadeTags, tag);
    }
  }

  return buildNode(facadeTags);
};
