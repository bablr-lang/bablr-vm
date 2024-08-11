export function updateSpans(ctx, s, node, phase) {
  switch (phase) {
    case 'open': {
      const { attributes, flags } = node;
      const { span: innerSpan, balanced, balancedSpan, balancer, openSpan } = attributes || {};

      if (!flags.intrinsic && (balancer || balanced)) {
        throw new Error('balanced tokens must be instrinsic');
      }

      if (flags.intrinsic) {
        if (s.path && balanced) {
          s.spans = s.spans.push({
            type: 'Lexical',
            name: balancedSpan || s.span.name,
            path: s.path,
            guard: balanced,
          });

          if (innerSpan) {
            throw new Error();
          }
        }
      }

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

        if (!balancedNode.children[0].value.attributes.balanced) {
          throw new Error();
        }

        s.balanced = s.balanced.pop();

        s.spans = s.spans.pop();
      }

      if (balanced) {
        s.balanced = s.balanced.push(s.nodeForTag(s.result));
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
      const { flags, attributes } = node;
      const { balancedSpan, span: innerSpan, closeSpan, balanced } = attributes || {};

      if (balanced && !flags.intrinsic) {
        s.spans = s.spans.push({
          type: 'Lexical',
          name: balancedSpan || s.span.name,
          path: s.path,
          guard: balanced,
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
