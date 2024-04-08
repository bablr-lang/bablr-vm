import { exec } from '@bablr/regex-vm';
import startsWithSeq from 'iter-tools-es/methods/starts-with-seq';
import isString from 'iter-tools-es/methods/is-string';

export const assertValidRegex = (expr) => {
  const { flags } = expr;

  if (!expr.language === 'Spamex' && expr.type === 'Regex') {
    throw new Error();
  }

  // TODO validate the rest of it
};

export const match = (pattern, source) => {
  let result;
  if (isString(pattern)) {
    if (startsWithSeq(pattern, source)) {
      result = pattern.split('');
    }
  } else if (pattern.type === 'Pattern') {
    assertValidRegex(pattern);

    ({ 0: result = null } = exec(pattern, source));
  } else {
    throw new Error();
  }
  return result;
};

export function* guardWithPattern(pattern, source) {
  const guarded = source.branch();

  while (!match(pattern, guarded)) {
    yield guarded.value;
    guarded.advance();
  }
}
