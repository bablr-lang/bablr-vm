const { TextSource } = require('./text.js');
const { TokensSource } = require('./tokens.js');
const { NoSource, noSource } = require('./none.js');

const { isArray } = Array;

const sourceFor = (node, context) => {
  const { sourceText } = context.options;
  // prettier-ignore
  return sourceText != null
    ? new TextSource(sourceText)
    : isArray(node.cstTokens)
      ? new TokensSource(node)
      : noSource;
};

module.exports = { TextSource, TokensSource, NoSource, noSource, sourceFor };
