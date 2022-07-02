const { visitors } = require('./grammar.js');
const { exec, buildContext } = require('./exec.js');
const { sourceFor } = require('./sources.js');

function __updateTokens(matchNode, matchNodes) {
  const { tokens, node } = matchNode;

  node.tokens = tokens;

  for (const token of tokens) {
    if (token.type === 'Reference') {
      __updateTokens(matchNodes.get(token), matchNodes);
    }
  }
}

function updateTokens(node, options = {}) {
  const context = buildContext(visitors);
  const source = sourceFor(node, options);
  const { matchNodes } = context;

  __updateTokens(exec(node, source, context), matchNodes);
}

function __print(matchNode, matchNodes) {
  const { tokens } = matchNode;

  let str = '';

  for (const token of tokens) {
    if (token.type === 'Reference') {
      str += __print(matchNodes.get(token), matchNodes);
    } else {
      str += token.value;
    }
  }

  return str;
}

function print(node) {
  const context = buildContext(visitors);
  const source = sourceFor(node);
  const { matchNodes } = context;

  return __print(exec(node, source, context), matchNodes);
}

module.exports = { updateTokens, print };
