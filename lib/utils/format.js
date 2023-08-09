export const formatType = (type) => {
  return typeof type === 'symbol' ? `${type.description.replace(/^@bablr\//y, '')}` : `'${type}'`;
};

export const formatGraveString = (str) => {
  return `\`${str
    .replace(/`/g, '\\`')
    .replace(/[\r\n\u{00}\u{08}\u{0B}\u{0C}\u{0E}-\u{1F}]/gu, '')}\``;
};

export const formatToken = (token) => {
  return `${formatType(token.type)}${formatGraveString(token.value)}`;
};
