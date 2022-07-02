const { zipAll } = require('iter-tools-es');
const { get } = require('./object.js');
const { RefResolver } = require('./refs.js');

const tokensEqual = (a, b) => {
  if ((!a && b) || (a && !b)) {
    return false;
  }
  return a.type === b.type && a.value === b.value;
};

const nodeTokensEqual = (a, b) => {
  const resolver = new RefResolver(a);

  for (const [aTok, bTok] of zipAll(a.cstTokens, b.cstTokens)) {
    if (!tokensEqual(aTok, bTok)) {
      return false;
    }
    if (aTok.type === 'Reference') {
      const path = resolver.resolve(a);
      if (!nodeTokensEqual(get(a, path), get(b, path))) {
        return false;
      }
    }
  }

  return true;
};

module.exports = { tokensEqual, nodeTokensEqual };
