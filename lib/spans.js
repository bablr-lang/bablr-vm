import { ReferenceTag } from '@bablr/agast-helpers/symbols';
import * as BTree from '@bablr/agast-helpers/btree';
import { buildPattern } from '@bablr/helpers/builders';
import { getComputedFlags } from '@bablr/agast-helpers/path';

const popSpan = (s) => {
  s.spans = s.spans.pop();
};

const pushSpan = (s, type, name, guard) => {
  let isSubspan = name[0] === '.';
  let topFrame = s.spans.value;

  // if (isSubspan) {
  //   let buildGuard = () => {
  //     return buildPattern();
  //   };
  //   let name_ = topFrame.name + name;
  //   let subframes = BTree.push(topFrame.subframes, topFrame);
  //   let guard_ = guard;

  //   s.spans = s.spans.push({ type, name: name_, guard: guard_, subframes });
  // } else {
  s.spans = s.spans.push({ type, name, guard, subframes: BTree.fromValues([]) });
  // }
};

export function updateSpans(m, phase) {
  const { state: s } = m;
  const refPath = m.reference;

  if (refPath && refPath.tag.type !== ReferenceTag) throw new Error();

  const intrinsic =
    !refPath ||
    (refPath.tag.type === ReferenceTag && getComputedFlags(refPath.tag.value).intrinsic);

  switch (phase) {
    case 'open': {
      if (m.language !== m.parent?.language) {
        pushSpan(s, 'Explicit', 'Bare', null);
      }

      break;
    }

    case 'close': {
      if (m.language !== m.parent?.language) {
        popSpan(s);
      }

      break;
    }
    default:
      throw new Error();
  }
}
