const { reference } = require('../symbols.js');

function* DefaultFragment() {
  yield {
    type: reference,
    value: 'fragment',
  };
}

const fragmentNodeFor = (node, source) => {
  return node.type === 'CSTFragment'
    ? node
    : {
        type: 'CSTFragment',
        fragment: node,
        ...(source.type === 'TokensSource'
          ? { cstTokens: [{ type: 'Reference', value: 'fragment' }] }
          : {}),
      };
};

module.exports = { DefaultFragment, fragmentNodeFor };
