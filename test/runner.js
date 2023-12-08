/* global console, URL, globalThis */

import { streamParse, streamPrintPrettyCSTML } from '@bablr/vm';
import { logEnhancer } from '@bablr/hol-debug-log';
import indent from 'indent-string';
import * as JSON from './languages/json/grammar.js';
import { testCases as jsonTestCases } from './languages/json/cases.js';

Error.stackTraceLimit = 20;

let testCases = jsonTestCases;

const onlyCases = testCases.filter((case_) => case_.only);

if (onlyCases.length) {
  testCases = onlyCases;
}

for (const { matcher, sourceText, parsed, skip } of testCases) {
  const skipped = skip ? ' (skipped)' : '';
  console.log(`Input: \`${sourceText.replace(/[`\\]/g, '\\$&')}\`${skipped}`);

  if (!skip) {
    const terminals = streamParse(logEnhancer(JSON), sourceText, matcher);

    const printed = streamPrintPrettyCSTML(terminals);

    if (printed !== parsed) {
      throw new Error(
        `Assertion failure\n  Expected:\n${indent(parsed, 4)}\n  Received:\n${indent(
          printed,
          4,
        )}\n`,
      );
    }
  }
  console.log();
}
