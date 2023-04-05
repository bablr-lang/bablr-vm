import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';
import { print, traverse } from 'cst-tokens';
import { parseModule as parse } from 'meriyah';
import { TokenGrammar } from '@cst-tokens/helpers/grammar/token';
import { NodeGrammar } from '@cst-tokens/helpers/grammar/node';
import { concat } from '@cst-tokens/helpers/iterable';

import { logEnhancer } from './enhancers/log.js';
import js from './languages/js-lite/index.js';

const ownDir = new URL(dirname(import.meta.url)).pathname;

Error.stackTraceLimit = 20;

const sourceText = readFileSync(resolve(ownDir, 'fixture'), 'utf8');

// console.log(JSON.stringify(parse(sourceText), undefined, 2));

const buildGrammars = (grammars, enhancers) => {
  const { node, token } = grammars;

  return {
    ...grammars,
    node: new NodeGrammar(node, concat(enhancers, node.enhancers)),
    token: new TokenGrammar(token, concat(enhancers, token.enhancers)),
  };
};

const buildLanguage = (language, enhancers) => {
  return { ...language, grammars: buildGrammars(language.grammars, enhancers) };
};

console.log('');

try {
  traverse(buildLanguage(js, [logEnhancer]), parse(sourceText), sourceText);
} catch (e) {
  console.log('');
  console.error(e);
}

// console.log(JSON.stringify(cst, undefined, 2));

// const printed = print(cst);

// if (printed !== sourceText) {
//   let m;
//   m = `source text could not be reconstructed from CST
//   Source: \`${`${sourceText.replace(/\n/g, '\\n')}`}\`
//   Printed: \`${`${printed.replace(/\n/g, '\\n')}`}\``;
//   throw new Error(m);
// }
