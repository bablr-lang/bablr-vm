import isString from 'iter-tools-es/methods/is-string';
import { generateMatches } from '@bablr/regex-vm';
import { getStreamIterator, maybeWait } from '@bablr/agast-helpers/stream';
import * as t from '@bablr/agast-helpers/shorthand';
import * as l from '@bablr/agast-vm-helpers/languages';

export const assertValidRegex = (expr) => {
  const { flags } = expr;

  if (!expr.language === 'Spamex' && expr.type === 'Regex') {
    throw new Error();
  }

  // TODO validate the rest of it
};

const buildStringRegex = (str) => {
  return t.node(l.Regex, 'Pattern', [t.ref`open`, t.ref`alternatives[]`, t.ref`close`], {
    open: t.s_node(l.Regex, 'Punctuator', '/'),
    alternatives: [
      t.node(l.Regex, 'Alternative', [t.ref`elements[]`], {
        elements: [...str].map((chr) => t.s_node(l.Regex, 'Character', chr)),
      }),
    ],
    close: t.s_node(l.Regex, 'Punctuator', '/'),
  });
};

export const match = (pattern, source) => {
  const pattern_ = isString(pattern) ? buildStringRegex(pattern) : pattern;

  if (pattern_.type !== 'Pattern') throw new Error();

  assertValidRegex(pattern_);

  const iter = getStreamIterator(generateMatches(pattern_, source));

  const step = iter.next();

  return maybeWait(step, (step) => (step.done ? null : step.value[0]));
};

class GuardedIterator {
  constructor(pattern, source) {
    this.pattern = pattern;
    this.fork = source.fork.clone();
    this.done = false;
  }

  next() {
    const { pattern, fork } = this;

    const guardMatch = match(pattern, fork.clone());

    return maybeWait(guardMatch, (guardMatch) => {
      if (guardMatch || this.done) {
        this.done = true;
        return { value: undefined, done: true };
      } else {
        const { value } = fork;
        return maybeWait(fork.advance(), (_) => ({ value, done: false }));
      }
    });
  }

  return() {
    this.fork.return();
  }

  [Symbol.for('@@streamIterator')]() {
    return this;
  }
}

export const guardWithPattern = (pattern, source) => {
  return new GuardedIterator(pattern, source.branch());
};
