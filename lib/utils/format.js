export const indent = (state, text = '') => {
  let str = state ? '  ' : '';

  for (let i = state.path.depth; i >= 0; i--) {
    str += '    ';
  }

  return str + text;
};

export const formatType = (type) => {
  return typeof type === 'symbol' ? `[${type.description.replace(/^cst-tokens\//y, '')}]` : type;
};

export const formatGraveString = (str) => {
  return `\`${str
    .replace(/`/g, '\\`')
    .replace(/[\r\n\u{00}\u{08}\u{0B}\u{0C}\u{0E}-\u{1F}]/gu, '')}\``;
};

export const formatToken = (token) => {
  return `${formatType(token.type)}${formatGraveString(token.value)}`;
};

export const formatIndex = (s) => {
  const { source, hoist, hoistPath } = s;
  const nodeName = hoist ? ` ${formatType(hoistPath.node.type)}` : '';
  let at;
  if (source.type === TokensSource && hoist && source.sourceNode !== hoistPath.node) {
    at = `${source.sourceNode}.${source.formatIndex()}`;
  } else {
    at = source.formatIndex();
  }
  return `${nodeName} @ ${at}`;
};
