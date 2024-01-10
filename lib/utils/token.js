import { freezeSeal } from './object.js';

export const isNewlineToken = (token) => /^\r|\r\n|\n$/.test(token.value);

export const assertValidRegex = (expr) => {
  const { flags } = expr;

  if (!expr.language === 'Spamex' && expr.type === 'Regex') {
    throw new Error();
  }

  // TODO validate the rest of it
};

export const getCooked = (token) => {
  return token.children
    .map((child) => {
      if (child.type === 'Escape') {
        return child.value.cooked;
      } else if (child.type === 'Literal') {
        return child.value;
      } else throw new Error();
    })
    .join('');
};

export const terminalTypeForSuffix = (suffix) => {
  // prettier-ignore
  switch (suffix) {
    case '!': return 'Escape';
    case '#': return 'Trivia';
    case null:
    case undefined: return 'Literal';
    default: throw new Error();
  }
};

export const getRaw = (token) => {
  return token.children
    .map((child) => {
      if (child.type === 'Escape') {
        return child.value.raw;
      } else if (child.type === 'Literal') {
        return child.value;
      } else throw new Error();
    })
    .join('');
};

export const buildReferenceTag = (pathName, pathIsArray) => {
  return freezeSeal({ type: 'ReferenceTag', value: freezeSeal({ pathName, pathIsArray }) });
};

export const buildNodeOpenTag = (type, attributes = {}) => {
  return freezeSeal({ type: 'OpenNodeTag', value: freezeSeal({ type, attributes }) });
};

export const buildFragmentOpenTag = () => {
  return freezeSeal({ type: 'OpenFragmentTag', value: undefined });
};

export const buildNodeCloseTag = (type) => {
  return freezeSeal({ type: 'CloseNodeTag', value: freezeSeal({ type }) });
};

export function* ownChildrenFor(range) {
  throw new Error('unimplemented');
}

export function* allChildrenFor(range) {
  throw new Error('unimplemented');
}
