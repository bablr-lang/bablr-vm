/* global console, URL */

import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';
import { parse } from '@bablr/vm';

import { logEnhancer } from '@bablr/language-enhancer-debug-log';
import * as cstml from '../lib/languages/cstml/index.js';

const ownDir = new URL(dirname(import.meta.url)).pathname;

Error.stackTraceLimit = 20;

const sourceText = readFileSync(resolve(ownDir, 'fixtures/play'), 'utf8');

console.log('');

console.log(sourceText);

console.log('');

try {
  for (const token of parse(logEnhancer(cstml), sourceText, 'Element')) {
    // for (const token of parse(cstml, sourceText, 'Element')) {
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
