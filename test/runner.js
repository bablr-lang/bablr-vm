/* global console, URL, globalThis */

import { parseCSTML, print, printTerminal } from '@bablr/vm';
import { spam } from '@bablr/boot';
import { logEnhancer } from '@bablr/language-enhancer-debug-log';
import * as JSON from './languages/json.js';

const jsonTestCases = [
  {
    matcher: spam`<Expression>`,
    sourceText: '"hello"',
    parsed: `<String><Punctuator>'"'</><StringContent>'hello'</><Punctuator>'"'</></>`,
  },
  {
    matcher: spam`<Expression>`,
    sourceText: 'true',
    parsed: "<Boolean><Keyword>'true'</></>",
  },
];

globalThis.__print = print;

Error.stackTraceLimit = 20;

for (const { matcher, sourceText, parsed } of jsonTestCases) {
  try {
    const result = parseCSTML(logEnhancer(JSON), sourceText, matcher);

    if (result !== parsed) {
      throw new Error(`Assertion failure\n  Expected: ${parsed}\n  Received: ${result}`);
    }

    console.log('');
  } catch (e) {
    console.log('');
    console.error(e);
  }
}

// console.log(JSON.stringify(cst, undefined, 2));

// const printed = print(cst);
