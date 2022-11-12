const { traverse } = require('./traverse.js');
const { Resolver } = require('./resolver.js');
const { get, set } = require('./utils/object.js');

function __fromAst(matchNode, matchNodesByRef, options) {
  const { cstTokens, node: astNode } = matchNode;

  const { type, loc, range, start, end, extra, ...astProps } = astNode;

  const node = {
    type,
    cstTokens,
  };

  for (const key of Object.keys(astNode)) {
    if (!options.ignoreProperties.has(key)) {
      node[key] = astNode[key];
    }
  }

  const resolver = new Resolver(astNode);

  for (const token of cstTokens) {
    if (token.type === 'Reference') {
      const path = resolver.consume(token.value);
      const cstNode = __fromAst(matchNodesByRef.get(token), matchNodesByRef, options);

      set(node, path, cstNode);
    }
  }

  return node;
}

function fromAst(node, grammar, options = {}) {
  if (node.type === 'CSTFragment') {
    throw new Error('node is not an AST');
  }

  const { ignoreProperties, ...options_ } = options;
  const ownOptions = {
    ignoreProperties: new Set(options.ignoreProperties || grammar.options?.ignoreProperties || []),
  };

  return __fromAst(...traverse(node, grammar, options_), ownOptions);
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
  return __reprint(...traverse(node, grammar, options));
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
