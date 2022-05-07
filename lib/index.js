const { map } = require('iter-tools-es');
const { hasRange } = require('./utils/range.js');
const { RefResolver } = require('./utils/refs.js');
const { visitorKeys } = require('./utils/visitor-keys.js');
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

  for (const token of generateTokens(node, options)) {
    if (token.type === 'Reference') {
      yield* generateAllTokens(refResolver.resolve(token), options);
    } else {
      yield token;
    }
  }
}

function rebuildTokens(node, options = {}) {
  node.tokens = [...generateTokens(node, options)];
}

function rebuildAllTokens(node, options = {}) {
  // rebuild tokens depth-first because some types inspect their children to make decisions about their tokens
  for (const key of visitorKeys[node.type]) {
    const referenced = node[key];
    if (referenced == null) {
      continue;
    } else if (Array.isArray(referenced)) {
      for (const value of referenced) {
        rebuildAllTokens(value, options);
      }
    } else {
      rebuildAllTokens(referenced, options);
    }
  }

  rebuildTokens(node, options);
}

function print(node) {
  return [...map((token) => token.value, generateAllTokens(node))].join('');
}

module.exports = { generateTokens, generateAllTokens, rebuildTokens, rebuildAllTokens, print };
