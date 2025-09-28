import { ReferenceTag } from '@bablr/agast-helpers/symbols';
import * as BTree from '@bablr/agast-helpers/btree';
import { buildPattern } from '@bablr/helpers/builders';

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

export function updateSpans(m, node, phase) {
  const { state: s } = m;
  const { attributes } = node;
  const refPath = m.reference;

  if (refPath && refPath.tag.type !== ReferenceTag) throw new Error();

  const intrinsic = !refPath || (refPath.tag.type === ReferenceTag && !refPath.tag.value.hasGap);

  switch (phase) {
    case 'open': {
      const { balancedSpan, span: innerSpan, balanced, balancer, openSpan } = attributes || {};

      if (!intrinsic && (balancer || balanced)) {
        throw new Error('balanced tokens must be instrinsic');
      }

      if (balancedSpan && !balanced) throw new Error();

      if (openSpan) {
        pushSpan(s, 'Explicit', openSpan, null);
      }

      if (innerSpan) {
        pushSpan(s, 'Inner', innerSpan, null);
      }

      if (!node.openTag.value.selfClosing && m.language !== m.parent.language) {
        pushSpan(s, 'Explicit', 'Bare', null);
      }

      break;
    }

    case 'close': {
      const { balancedSpan, span: innerSpan, closeSpan, balanced, balancer } = attributes || {};

      if (balanced) {
        s.balanced = s.balanced.push(node);

        pushSpan(s, 'Lexical', balancedSpan || s.span.name, balanced === true ? null : balanced);
      }

      if (balancer) {
        const balancedNode = s.balanced.value;

        if (!s.balanced.size) throw new Error();

        if (!balancedNode.attributes.balanced) {
          throw new Error();
        }

        s.balanced = s.balanced.pop();

        popSpan(s);
      }

      if (closeSpan) {
        if (s.spans.value.type !== 'Explicit') throw new Error();
        popSpan(s);
      }

      if (innerSpan) {
        popSpan(s);
      }

      if (!node.openTag.value.selfClosing && m.language !== m.parent?.language) {
        popSpan(s);
      }

      break;
    }
    default:
      throw new Error();
  }
}
