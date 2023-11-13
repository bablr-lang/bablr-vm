import { PathResolver } from '@bablr/boot-helpers/path';

export const print = (node) => {
  const resolver = new PathResolver(node);
  let printed = '';

  for (const child of node.children) {
    if (child.type === 'Literal' || child.type === 'Trivia') {
      printed += child.value;
    } else if (child.type === 'Escape') {
      printed += child.raw.value;
    } else if (child.type === 'Reference') {
      printed += print(resolver.get(child.value));
    }
  }

  return printed;
};
