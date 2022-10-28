const { TextSourceFacade } = require('./text.js');
const { TokensSourceFacade } = require('./tokens.js');

const sourceFor = (node, grammar, options) => {
  const { sourceText } = options;

  return sourceText != null ? TextSourceFacade.from(sourceText) : TokensSourceFacade.from(node);
};

module.exports = { sourceFor };
