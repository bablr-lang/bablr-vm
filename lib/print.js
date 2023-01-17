import { get } from './utils/object.js';
import { Resolver } from './resolver.js';

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
      yield* printTokens(get(node, path));
    } else {
      yield token;
    }
  }
}
