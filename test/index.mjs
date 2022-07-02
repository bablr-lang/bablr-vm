import { join } from 'path';
import { readFile } from 'fs/promises';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseModule } from 'meriyah';
import { updateTokens, updateRanges, print } from 'cst-tokens';

Error.stackTraceLimit = 20;

const __dirname = dirname(fileURLToPath(import.meta.url));

const readFixture = (path) => readFile(join(__dirname, 'fixtures', path), 'utf-8');

const sourceText = await readFixture('imports.js');
const ast = parseModule(sourceText);

updateTokens(ast, { sourceText });

console.log(JSON.stringify(ast, undefined, 2));

const printed = print(ast);

console.log(sourceText);
console.log(printed);

if (printed !== sourceText) {
  throw new Error('How has it all gone wrong?');
}
