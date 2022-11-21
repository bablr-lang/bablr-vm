import { get } from './utils/object.js';
import { traverse } from './traverse.js';
import { Resolver } from './resolver.js';

export const fromAst = (node, grammar, options = {}) => {
  return traverse(node, grammar, options);
};

export const print = (node) => {
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
};
