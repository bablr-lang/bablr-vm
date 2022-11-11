const indent = (state, text = '') => {
  let str = '';

  for (let i = state.depth - 1; i >= 0; i--) {
    str += '    ';
  }

  return str + text;
};

const indentModule = (state, text = '') => {
  let str = state ? '  ' : '';

  for (let i = state.depth; i >= 0; i--) {
    str += '    ';
  }

  return str + text;
};

const formatType = (type) => {
  return typeof type === 'symbol' ? `[${type.description}]` : type;
};

const formatGraveString = (str) => {
  return `\`${str
    .replace(/`/g, '\\`')
    .replace(/[\r\n\u{00}\u{08}\u{0B}\u{0C}\u{0E}-\u{1F}]/gu, '')}\``;
};

const formatToken = (token) => {
  return `${formatType(token.type)}${formatGraveString(token.value)}`;
};

module.exports = { indent, indentModule, formatType, formatGraveString, formatToken };
