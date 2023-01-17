import { freezeSeal } from './object.js';

export const isNewlineToken = (token) => /^\r|\r\n|\n$/.test(token.value);

export const createToken = (type, value) => {
  const token = Object.create(null);
  token.type = type;
  token.value = value;
  return freezeSeal(token);
};
