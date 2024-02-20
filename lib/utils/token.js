export const isNewlineToken = (token) => /^\r|\r\n|\n$/.test(token.value);

export const assertValidRegex = (expr) => {
  const { flags } = expr;

  if (!expr.language === 'Spamex' && expr.type === 'Regex') {
    throw new Error();
  }

  // TODO validate the rest of it
};

export function* ownChildrenFor(range) {
  throw new Error('unimplemented');
}

export function* allChildrenFor(range) {
  throw new Error('unimplemented');
}
