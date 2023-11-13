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

export function* ownChildrenFor(range) {
  throw new Error('unimplemented');
}

export function* allChildrenFor(range) {
  throw new Error('unimplemented');
}
