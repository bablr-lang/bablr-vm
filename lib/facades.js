import * as Tags from '@bablr/agast-helpers/tags';
import * as BList from '@bablr/agast-helpers/b-list';
import { buildGapTag, parseTagType, printSums } from 'agast';
import { buildFacadeLayer } from '@bablr/agast-vm-helpers/facades';
import { isStubNode, buildSumsForNode } from '@bablr/agast-helpers/path';
import { GapNode, Property } from '@bablr/agast-helpers/symbols';
import { isArray, isObject } from '@bablr/agast-helpers/object';

export const { facades, actuals } = buildFacadeLayer();

let gapNodes = new WeakMap();

export const getGapNode = (node) => {
  return parseTagType(node) === GapNode ? gapNodes.get(node) || node : node;
};

export const buildFacadeNode = (reference, node) => {
  if (!node) return null;
  if (reference?.flags.hasGap) return Tags.fromValues([buildGapTag()]);

  if (isStubNode(node)) {
    return node;
  }

  return Tags.map((tag) => {
    if (isArray(tag) && parseTagType(tag) === Property) {
      let tags = tag;
      let { 0: sigilTag, 4: node } = tags;

      let tags_;
      if (reference?.flags.intrinsic || ['_', '#', '@'].includes(reference?.type)) {
        tags_ = Tags.fromValues(
          [tags[0], tags[1], '', buildSumsForNode(node), buildFacadeNode(reference, node)],
          1,
        );
      } else {
        let gapNode = Tags.fromValues(['<//>']);
        if (!reference?.flags.hasGap) {
          gapNodes.set(gapNode, node);
        }

        tags_ = Tags.fromValues([tags[0], tags[1], '', '', gapNode], 1);
      }

      return tags_;
    } else {
      return tag;
    }
  }, node);
};
