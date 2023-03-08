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

export const createToken = (type, value) => {
  const token = Object.create(null);
  token.type = type;
  token.value = value;
  return freezeSeal(token);
};
