const { get } = require('./utils/object.js');
const { traverse } = require('./traverse.js');
const { Resolver } = require('./resolver.js');
const { cstNodesByRef } = require('./cst.js');

function fromAst(node, grammar, options = {}) {
  return traverse(node, grammar, options);
}

function __reprint(cst) {
  const { cstTokens } = cst;

  let str = '';

  for (const token of cstTokens) {
    if (token.type === 'Reference') {
      str += __reprint(cstNodesByRef.get(token));
    } else {
      str += token.value;
    }
  }

  return str;
}

function reprint(node, grammar, options) {
  return __reprint(traverse(node, grammar, options));
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

module.exports = { fromAst, reprint, print };
