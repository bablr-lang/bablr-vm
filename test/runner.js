/* global console, URL, globalThis */

import { parseCSTML, print } from '@bablr/vm';
import { spam } from '@bablr/boot';
import { logEnhancer } from '@bablr/language-enhancer-debug-log';
import * as JSON from './languages/json.js';

const jsonTestCases = [
  {
    matcher: spam`<Expression>`,
    sourceText: '"hello"',
    parsed: `<String><Punctuator .open balanced='"' innerSpan='String'>'"'</><StringContent .content>'hello'</><Punctuator .close balancer>'"'</></>`,
  },
  {
    matcher: spam`<Expression>`,
    sourceText: 'true',
    parsed: "<Boolean><Keyword .value>'true'</></>",
  },
  {
    matcher: spam`<Expression>`,
    sourceText: '1',
    parsed: "<Number><Digit .digits>'1'</></>",
  },
  {
    matcher: spam`<Expression>`,
    sourceText: 'null',
    parsed: "<Null><Keyword .value>'null'</></>",
  },
  {
    matcher: spam`<Expression>`,
    sourceText: '[]',
    parsed: `<Array><Punctuator .open balanced=']'>'['</><Punctuator .close balancer>']'</></>`,
  },
];

globalThis.__print = print;

Error.stackTraceLimit = 20;

const onlyTest = jsonTestCases.find((case_) => case_.only);
const testCases = onlyTest ? [onlyTest] : jsonTestCases;

for (const { matcher, sourceText, parsed } of testCases) {
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
