import { join, dirname } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { build, print } from 'cst-tokens';

import jsImportGrammar, { parse } from './grammars/js-imports.js';

Error.stackTraceLimit = 20;

const __dirname = dirname(fileURLToPath(import.meta.url));

const readFixture = (path) => readFileSync(join(__dirname, 'fixtures', path), 'utf-8');

const sourceText = readFixture('imports.js');

// console.log(JSON.stringify(parse(sourceText), undefined, 2));

const cst = build(parse(sourceText), jsImportGrammar, { sourceText });

// console.log(JSON.stringify(cst, undefined, 2));

const printed = print(cst);

if (printed !== sourceText) {
  let m;
  m = `source text could not be reconstructed from CST
  Source: \`${`${sourceText.replace(/\n/g, '\\n')}`}\`
  Printed: \`${`${printed.replace(/\n/g, '\\n')}`}\``;
  throw new Error(m);
}
