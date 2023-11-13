/* global console, URL */

import { dirname, resolve } from 'path';
import { parse } from '@bablr/vm';
import { spam } from '@bablr/boot';
import { logEnhancer } from '@bablr/language-enhancer-debug-log';
import * as JSON from './languages/json.js';

const ownDir = new URL(dirname(import.meta.url)).pathname;

Error.stackTraceLimit = 20;

// const sourceText = readFileSync(resolve(ownDir, 'fixtures/play'), 'utf8');
const sourceText = '"hello"';

console.log('');

console.log(sourceText);

console.log('');

try {
  // for (const token of parse(logEnhancer(JSON), sourceText, spam`<String>`)) {
  for (const token of parse(JSON, sourceText, spam`<String>`)) {
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
