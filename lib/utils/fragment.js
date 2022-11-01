const { reference, Fragment } = require('../symbols.js');

function* DefaultFragment() {
  yield {
    type: reference,
    value: 'fragment',
  };
}

const fragmentNodeFor = (node) => ({
  type: Fragment,
  fragment: node,
  cstTokens: [{ type: 'Reference', value: 'fragment' }],
});

module.exports = { DefaultFragment, fragmentNodeFor };
