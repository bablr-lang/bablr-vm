import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';
import { traverse } from 'cst-tokens';
import { TokenGrammar } from '@cst-tokens/helpers/grammar/token';
import { NodeGrammar } from '@cst-tokens/helpers/grammar/node';
import { concat } from '@cst-tokens/helpers/iterable';
import * as sym from '@cst-tokens/helpers/symbols';

import { logEnhancer, formatType } from './enhancers/log.js';
import regex, { parse } from './languages/regexpp/index.js';

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

const ast = parse(sourceText);

try {
  const tokens = [...traverse(buildLanguage(regex, [logEnhancer]), ast, sourceText)].map(
    ({ type, value }) => `    { type: ${formatType(type)}, value: ${formatType(value)} }`,
  );

  console.log('');

  console.log(`  [\n${tokens.join(',\n')}\n  ]`);
} catch (e) {
  console.log('');
  console.error(e);
}
