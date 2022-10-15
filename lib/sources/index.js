const { TextSourceFacade } = require('./text.js');
const { TokensSourceFacade } = require('./tokens.js');

const sourceFor = (node, grammar, options) => {
  const { isHoistable } = grammar;
  const { sourceText } = options;

  return sourceText != null
    ? TextSourceFacade.from(sourceText)
    : TokensSourceFacade.from(node, isHoistable);
};

module.exports = { sourceFor };
