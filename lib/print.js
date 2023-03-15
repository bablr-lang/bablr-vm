import { get } from './utils/object.js';
import { Resolver } from './resolver.js';
import { StartNode, EndNode } from './symbols.js';

export function* print(node) {
  const resolver = new Resolver(node);

  for (const token of node.cstTokens) {
    if (token.type === 'Reference') {
      const path = resolver.consume(token.value);
      yield* print(get(node, path));
    } else {
      yield* token.value;
    }
  }
}

export function* printTokens(node) {
  const resolver = new Resolver(node);

  for (const token of node.cstTokens) {
    if (token.type === 'Reference') {
      const path = resolver.consume(token.value);
      yield { type: StartNode, value: path.type };
      yield* printTokens(get(node, path));
      yield { type: EndNode, value: path.type };
    } else {
      yield token;
    }
  }
}
