export const isNewlineToken = (token) => /^\r|\r\n|\n$/.test(token.value);
