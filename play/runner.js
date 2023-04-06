import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';
import { print, traverse } from 'cst-tokens';
import { parse } from '@babel/parser';
import { TokenGrammar } from '@cst-tokens/helpers/grammar/token';
import { NodeGrammar } from '@cst-tokens/helpers/grammar/node';
import { concat } from '@cst-tokens/helpers/iterable';

import { logEnhancer, formatType } from './enhancers/log.js';
import js from './languages/js-lite/index.js';

const ownDir = new URL(dirname(import.meta.url)).pathname;

Error.stackTraceLimit = 20;

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

const sourceText = readFileSync(resolve(ownDir, 'fixture'), 'utf8');
const ast = parse(sourceText, { sourceType: 'module', ranges: false }).program;

console.log('');

console.log(sourceText);

console.log('');

try {
  const tokens = [...traverse(buildLanguage(js, [logEnhancer]), ast, sourceText)].map(
    ({ type, value }) => `    { type: ${formatType(type)}, value: ${formatType(value)} }`,
  );

  console.log('');

  console.log(`  [\n${tokens.join(',\n')}\n  ]`);
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
