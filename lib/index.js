const { visitors } = require('./grammar.js');
const { match, buildContext } = require('./match.js');
const { TextSource } = require('./sources.js');

function __updateTokens(matchNode, matchNodes) {
  const { tokens, node } = matchNode;

  node.tokens = tokens;

  for (const token of tokens) {
    if (token.type === 'Reference') {
      __updateTokens(matchNodes.get(token), matchNodes);
    }
  }
}

function updateTokens(node, { sourceText }) {
  const context = buildContext(visitors);
  const { matchNodes } = context;
  // TODO...
  const source = new TextSource(sourceText);

  __updateTokens(match(node, source, context), matchNodes);
}

module.exports = { updateTokens };
