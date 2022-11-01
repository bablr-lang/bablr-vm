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

const formatNodeType = (node) => {
  const { type } = node;
  return typeof type === 'symbol'
    ? `[${type.description.replace('@cst-tokens/grammars/', '')}]`
    : type;
};

module.exports = { indent, indentModule, formatNodeType };
