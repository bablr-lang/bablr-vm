import { isRegex } from './object.js';

export const isNewlineToken = (token) => /^\r|\r\n|\n$/.test(token.value);

export const assertValidRegex = (pattern) => {
  if (pattern.type !== 'RegExpLiteral') {
    throw new Error('Unsupported pattern');
  }

  // TODO validate the rest of it

  if (!pattern.value.flags.includes('y')) {
    throw new Error('All regular expressions must be sticky!');
  }
};

export function* ownChildrenFor(range) {
  throw new Error('unimplemented');
}

export function* allChildrenFor(range) {
  throw new Error('unimplemented');
}
