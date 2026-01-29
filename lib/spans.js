import { ReferenceTag } from '@bablr/agast-helpers/symbols';
import * as Spans from '@bablr/agast-helpers/spans';
import { buildTypedSpan } from '@bablr/agast-helpers/builders';

const popSpan = (s) => {
  s.spans = Spans.pop(s.spans);
};

const pushSpan = (s, type, name, guard) => {
  s.spans = Spans.push(s.spans, buildTypedSpan(type, name, guard));
};

export function updateSpans(m, phase) {
  const { state: s } = m;
  const refPath = m.reference;

  if (refPath && refPath.tag.type !== ReferenceTag) throw new Error();

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
