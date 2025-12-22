import * as Tags from '@bablr/agast-helpers/tags';
import { buildGapTag, buildProperty } from '@bablr/agast-helpers/builders';
import { buildFacadeLayer } from '@bablr/agast-vm-helpers/facades';
import { buildNode, getTags } from '@bablr/agast-helpers/path';
import { Property } from '@bablr/agast-helpers/symbols';

export const { facades, actuals } = buildFacadeLayer();

export const buildFacadeNode = (node) => {
  let facadeTags = Tags.fromValues([]);

  for (let tag of Tags.traverse(getTags(node))) {
    if (tag.type === Property) {
      let property = tag;
      let { reference, bindings, node, tags } = property;

      let property_ = property;

      if (!reference.flags.intrinsic) {
        let gapNode = buildNode(buildGapTag());
        if (!reference.flags.hasGap) {
          actuals.set(gapNode, node);
        }

        let tags_ = Tags.fromValues([tags[0], tags[1], gapNode]);

        property_ = buildProperty(tags_);
      }

      facadeTags = Tags.push(facadeTags, property_);
    } else {
      facadeTags = Tags.push(facadeTags, tag);
    }
  }

  return buildNode(facadeTags);
};
