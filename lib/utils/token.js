export const isNewlineToken = (token) => /^\r|\r\n|\n$/.test(token.value);

export function* ownChildrenFor(range) {
  throw new Error('unimplemented');
}

export function* allChildrenFor(range) {
  throw new Error('unimplemented');
}
