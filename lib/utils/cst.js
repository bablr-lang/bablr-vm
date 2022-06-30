const { zipAll } = require('iter-tools-es');
const { get } = require('./object.js');
const { RefResolver } = require('./refs.js');

const tokensEqual = (a, b) => {
  return a.type === b.type && a.value === b.value;
};

const nodeTokensEqual = (a, b) => {
  const resolver = new RefResolver(a);

  for (const [a, b] of zipAll(a.tokens, b.tokens)) {
    if (!tokensEqual(a, b)) {
      return false;
    }
    if (a.type === 'Reference') {
      const path = resolver.resolve(a);
      if (!nodeTokensEqual(get(a, path), get(b, path))) {
        return false;
      }
    }
  }

  return true;
};

module.exports = { tokensEqual, nodeTokensEqual };
