import { buildLiteralTag, buildGapTag } from '@bablr/agast-helpers/builders';

export const isNewlineToken = (token) => /^\r|\r\n|\n$/.test(token.value);

export function* ownChildrenFor(range) {
  throw new Error('unimplemented');
}

export function* allChildrenFor(range) {
  throw new Error('unimplemented');
}

export function* buildTokens(chrs) {
  let str = '';
  for (const chr of chrs) {
    if (chr == null) {
      if (str) {
        yield buildLiteralTag(str);
        str = '';
      }
      yield buildGapTag();
    } else {
      str += chr;
    }
  }

  if (str) {
    yield buildLiteralTag(str);
  }
}
