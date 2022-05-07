const { hasRange } = require('./utils/range.js');
const { RefResolver } = require('./utils/refs.js');
const { MinimalBuilder, TokensBuilder, SourceBuilder } = require('./builders/index.js');
const { applyGrammar } = require('./grammar.js');

/**
 * Defines the best-effort strategy for preserving existing formatting.
 * Formatting is defined by tokens. What should we use as the source of tokens?
 */
const builderFor = (node, options = {}) => {
  // prettier-ignore
  const Builder = node.tokens
    // We already have parsed tokens so use them
    ? TokensBuilder
    : options.sourceText && hasRange(node)
      // We can use tokens from the source text
      ? SourceBuilder
      // We have no tokens, so generate the necessary ones
      : MinimalBuilder;

  return new Builder(node, options);
};

function generateTokens(node, options = {}) {
  const builder = builderFor(node, options);
  return applyGrammar(node, builder);
}

function* generateAllTokens(node, options = {}) {
  const refResolver = new RefResolver(node);

  for (const token of buildTokens(node, options)) {
    if (token.type === 'Reference') {
      yield* buildAllTokens(refResolver.resolve(token), options);
    } else {
      yield token;
    }
  }
}

function rebuildTokens(node, options = {}) {
  node.tokens = [...generateTokens(node, options)];
}
function rebuildAllTokens(node, options = {}) {
  const refResolver = new RefResolver(node);

  rebuildTokens(node, options);

  for (const token of node.tokens) {
    if (token.type === 'Reference') {
      rebuildAllTokens(refResolver.resolve(token), options);
    }
  }
}

module.exports = { generateTokens, generateAllTokens, rebuildTokens, rebuildAllTokens };
