const { visitors } = require('./grammar.js');
const { match, buildContext } = require('./match.js');
const { TextSource } = require('./sources.js');

function __updateTokens(matchNode, refs) {
  const { tokens, node } = matchNode;

  node.tokens = tokens;

  for (const token of tokens) {
    if (token.type === 'Reference') {
      __updateTokens(refs.get(token), refs);
    }
  }
}

function updateTokens(node, { sourceText }) {
  const context = buildContext(visitors);
  const { refs } = context;
  // TODO...
  const source = new TextSource(sourceText);

  __updateTokens(match(node, source, context), refs);
}

module.exports = { updateTokens };
