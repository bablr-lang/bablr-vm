const { isArray, freezeSeal, hasOwn } = require('./utils/object.js');

const cstNodesByRef = new WeakMap();

function buildCSTNode(ref, astNode, cstTokens, grammar) {
  freezeSeal(cstTokens);

  const node = {
    type: astNode.type,
    cstTokens,
  };

  for (const token of cstTokens) {
    freezeSeal(token);

    if (token.type === 'Reference') {
      const key = token.value;

      const cstNode = cstNodesByRef.get(token);

      if (isArray(astNode[key])) {
        node[key] = node[key] || [];
        node[key].push(cstNode);
      } else {
        node[key] = cstNode;
      }
    }
  }

  for (const key of Object.keys(astNode)) {
    if (!grammar.ignoreProperties?.has(key)) {
      let value = astNode[key];
      if (typeof value !== 'function' && value !== undefined && !hasOwn(node, key)) {
        if (value && typeof value === 'object') {
          value = freezeSeal(isArray(value) ? [...value] : { ...value });
        }
        node[key] = value;
      }
    }
  }

  freezeSeal(node);

  if (ref) {
    cstNodesByRef.set(ref, node);
  }

  return node;
}

module.exports = { cstNodesByRef, buildCSTNode };
