const { __traverse } = require('./traverse.js');
const { Resolver } = require('./resolver.js');
const { get } = require('./utils/object.js');

function __updateTokens(matchNode, matchNodesByRef) {
  const { cstTokens, node } = matchNode;

  node.cstTokens = cstTokens;

  for (const token of cstTokens) {
    if (token.type === 'Reference') {
      __updateTokens(matchNodesByRef.get(token), matchNodesByRef);
    }
  }
}

function updateTokens(node, grammar, options) {
  __updateTokens(...__traverse(node, grammar, options));
}

function __updateRanges(matchNode, matchNodesByRef, position = 0) {
  const { cstTokens, node } = matchNode;

  node.range = [];

  node.range[0] = position;

  for (const token of cstTokens) {
    if (token.type === 'Reference') {
      position = __updateRanges(matchNodesByRef.get(token), matchNodesByRef, position);
    } else {
      position += token.value.length;
    }
  }

  node.range[1] = position;

  return position;
}

function updateRanges(node, grammar, options) {
  __updateRanges(...__traverse(node, grammar, options));
}

function __reprint(matchNode, matchNodesByRef) {
  const { cstTokens } = matchNode;

  let str = '';

  for (const token of cstTokens) {
    if (token.type === 'Reference') {
      str += __reprint(matchNodesByRef.get(token), matchNodesByRef);
    } else {
      str += token.value;
    }
  }

  return str;
}

function reprint(node, grammar, options) {
  return __reprint(...__traverse(node, grammar, options));
}

function print(node) {
  const resolver = new Resolver(node);
  let str = '';
  for (const token of node.cstTokens) {
    if (token.type === 'Reference') {
      const path = resolver.consume(token.value);
      str += print(get(node, path));
    } else {
      str += token.value;
    }
  }
  return str;
}

module.exports = { updateTokens, updateRanges, reprint, print };
