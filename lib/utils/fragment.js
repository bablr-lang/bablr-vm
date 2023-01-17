import { reference, Fragment } from '../symbols.js';

export { Fragment };

export function* DefaultFragment({ path }) {
  yield {
    type: reference,
    value: [path.capture('fragment'), 'Node'],
  };
}

export const fragmentNodeFor = (node) => {
  return node.type === Fragment
    ? node
    : {
        type: Fragment,
        fragment: node,
      };
};
