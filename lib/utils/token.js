import { freezeSeal, isRegex } from './object.js';

export const isNewlineToken = (token) => /^\r|\r\n|\n$/.test(token.value);

export const assertValidRegex = (pattern) => {
  if (!isRegex(pattern)) {
    throw new Error('Unsupported pattern');
  }

  if (!pattern.flags.includes('y')) {
    throw new Error('All regular expressions must be sticky!');
  }
};

export const createTokenTag = (type, attrs = new Map()) => {
  return freezeSeal({
    type: 'TokenTag',
    name: type,
    attrs,
  });
};

export function* ownChildrenFor(range) {
  throw new Error('unimplemented');
}

export function* allChildrenFor(range) {
  throw new Error('unimplemented');
}
