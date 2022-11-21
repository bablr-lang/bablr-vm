import { reference } from '../symbols.js';

export function* DefaultFragment() {
  yield {
    type: reference,
    value: 'fragment',
  };
}

export const fragmentNodeFor = (node, source) => {
  return node.type === 'CSTFragment'
    ? node
    : {
        type: 'CSTFragment',
        fragment: node,
        ...(source.type === 'TokensSource'
          ? { cstTokens: [{ type: 'Reference', value: 'fragment' }] }
          : {}),
      };
};
