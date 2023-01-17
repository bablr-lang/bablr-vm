import Grammar from '@cst-tokens/grammar';
import { objectEntries } from 'iter-tools-es';
import { isArray, freezeSeal, hasOwn } from './utils/object.js';
import { traverse } from './traverse.js';

export const cstNodesByRef = new WeakMap();

export const grammar = new Grammar({
  productions: objectEntries({
    *Node({ language, path, captures, cstTokens }) {
      const node = { type: path.type, cstTokens };

      for (const token of cstTokens) {
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
        if (!language.grammars.syntax.ignoreProperties?.has(key)) {
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

      if (path.ref) {
        cstNodesByRef.set(path.ref, node);
      }

      return node;
    },
  }),
});

export function build(language, node, source) {
  return traverse(language, grammar, node, source);
}
