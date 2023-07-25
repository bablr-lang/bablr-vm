import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'cst-tokens';
import { TokenGrammar } from '@cst-tokens/helpers/grammar/token';
import { NodeGrammar } from '@cst-tokens/helpers/grammar/node';
import { concat } from '@cst-tokens/helpers/iterable';
import * as sym from '@cst-tokens/helpers/symbols';

import { logEnhancer, formatType } from './enhancers/log.js';
import js from '../lib/languages/cstml/index.js';

const ownDir = new URL(dirname(import.meta.url)).pathname;

Error.stackTraceLimit = 20;

const buildGrammars = (grammars, enhancers) => {
  const { [sym.node]: node, [sym.token]: token } = grammars;

  return {
    ...grammars,
    [sym.node]: new NodeGrammar(node, concat(enhancers, node.enhancers)),
    [sym.token]: new TokenGrammar(token, concat(enhancers, token.enhancers)),
  };
};

const buildLanguage = (language, enhancers) => {
  return { ...language, grammars: buildGrammars(language.grammars, enhancers) };
};

const sourceText = readFileSync(resolve(ownDir, 'fixture'), 'utf8');

console.log('');

console.log(sourceText);

console.log('');

try {
  for (const token of parse(buildLanguage(js, [logEnhancer]), sourceText, 'Fragment')) {
    const { type, value } = token;

    console.log(token);
    // console.log(`    { type: ${formatType(type)}, value: ${formatType(value)} }`);
  }

  console.log('');
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
