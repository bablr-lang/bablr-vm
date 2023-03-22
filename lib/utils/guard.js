import escapeRegex from 'escape-string-regexp';

import { isFunction, isString, isRegex } from './object.js';
import { facades } from './facades.js';

export const asRegex = (pattern) => {
  if (isString(pattern)) return new RegExp(escapeRegex(pattern), 'y');
  else if (isRegex(pattern)) return pattern;
  else throw new Error('invalid pattern');
};

export const getGuardPattern = (guard, value, state) => {
  const guard_ = isFunction(guard) ? guard({ value, state: facades.get(state) }) : guard;

  return asRegex(guard_);
};
