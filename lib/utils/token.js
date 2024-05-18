import { buildLiteral, buildGap } from '@bablr/agast-helpers/builders';

export const isNewlineToken = (token) => /^\r|\r\n|\n$/.test(token.value);

export function* ownChildrenFor(range) {
  throw new Error('unimplemented');
}

export function* allChildrenFor(range) {
  throw new Error('unimplemented');
}

export function* buildTokens(array) {
  let str = '';
  for (const chr of array) {
    if (chr == null) {
      if (str) {
        yield buildLiteral(str);
        str = '';
      }
      yield buildGap();
    } else {
      str += chr;
    }
  }

  if (str) {
    yield buildLiteral(str);
  }
}
