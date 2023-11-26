/* global console, URL, globalThis */

import { streamParse, streamPrintPrettyCSTML } from '@bablr/vm';
import { logEnhancer } from '@bablr/language-enhancer-debug-log';
import indent from 'indent-string';
import * as JSON from './languages/json/grammar.js';
import { testCases as jsonTestCases } from './languages/json/cases.js';

// globalThis.__print = prettyPrintCSTML;

Error.stackTraceLimit = 20;

const onlyTest = jsonTestCases.find((case_) => case_.only);
const testCases = onlyTest ? [onlyTest] : jsonTestCases;

for (const { matcher, sourceText, parsed } of testCases) {
  const terminals = streamParse(logEnhancer(JSON), sourceText, matcher);

  const printed = streamPrintPrettyCSTML(terminals);

  if (printed !== parsed) {
    throw new Error(
      `Assertion failure\n  Expected:\n${indent(parsed, 4)}\n  Received:\n${indent(printed, 4)}\n`,
    );
  }
}
