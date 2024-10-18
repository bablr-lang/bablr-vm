import { ReferenceTag } from '@bablr/agast-helpers/symbols';
import { getOpenTag } from '@bablr/agast-helpers/tree';

export function updateSpans(ctx, s, node, phase) {
  const { flags, attributes } = node;

  const openTag = getOpenTag(node);

  const ref = ctx.agast.getPreviousTag(openTag);

  const intrinsic = ref.type === ReferenceTag && !ref.hasGap;

  switch (phase) {
    case 'open': {
      const { balancedSpan, span: innerSpan, balanced, balancer, openSpan } = attributes || {};

      if (!intrinsic && (balancer || balanced)) {
        throw new Error('balanced tokens must be instrinsic');
      }

      if (balancedSpan && !balanced) throw new Error();

      if (openSpan) {
        s.spans = s.spans.push({
          type: 'Explicit',
          name: openSpan,
          path: s.path,
          guard: null,
        });
      }

      if (balancer) {
        const balancedNode = s.balanced.value;

        if (!s.balanced.size) throw new Error();

        if (!balancedNode.attributes.balanced) {
          throw new Error();
        }

        s.balanced = s.balanced.pop();

        s.spans = s.spans.pop();
      }

      if (innerSpan) {
        s.spans = s.spans.push({
          type: 'Inner',
          name: innerSpan,
          path: s.path,
          guard: null,
        });
      }

      break;
    }

    case 'close': {
      const { balancedSpan, span: innerSpan, closeSpan, balanced } = attributes || {};

      if (balanced) {
        s.balanced = s.balanced.push(s.nodeForTag(s.result));

        s.spans = s.spans.push({
          type: 'Lexical',
          name: balancedSpan || s.span.name,
          path: s.path,
          guard: balanced === true ? null : balanced,
        });
      }

      if (closeSpan) {
        if (s.spans.value.type !== 'Explicit') throw new Error();
        s.spans = s.spans.pop();
      }

      if (innerSpan) {
        s.spans = s.spans.pop();
      }
      break;
    }
    default:
      throw new Error();
  }
}
