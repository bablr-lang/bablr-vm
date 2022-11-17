# Setup

brew install pnpm

mkdir js-cst-tokens
cd js-cst-tokens
git clone https://github.com/js-cst-tokens/cst-tokens.git
git clone https://github.com/js-cst-tokens/helpers.git
git clone https://github.com/js-cst-tokens/js-grammar-estree.git

cd cst-tokens
# install deps
pnpm i

# Create play dir. It's in .gitignore because it’s hacky tests
mkdir play
edit test/index.mjs play/index.mjs

# Contents:
import { join, dirname } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { fromAst, print } from 'cst-tokens';

import jsImportGrammar, { parse } from '../test/grammars/js-imports.mjs';

Error.stackTraceLimit = 20;

const sourceText = "import { foo } from 'bar';";

// console.log(JSON.stringify(parse(sourceText), undefined, 2));

const cst = fromAst(parse(sourceText), jsImportGrammar, { sourceText });

// console.log(JSON.stringify(cst, undefined, 2));

const printed = print(cst);

if (printed !== sourceText) {
  let m;
  m = `source text could not be reconstructed from CST
  Source: \`${`${sourceText.replace(/\n/g, '\\n')}`}\`
  Printed: \`${`${printed.replace(/\n/g, '\\n')}`}\``;
  throw new Error(m);
}




# to start playing with any repo
node play/index.mjs
# Should have no output!

# Get DEBUG output
DEBUG=* node play/index.mjs


# Appendix
What is .mjs?
see https://stackoverflow.com/questions/57492546/what-is-the-difference-between-js-and-mjs-files
needed because we’re using commonjs (require) and modern ecma module (import/export)
we’ll eventually get rid of commonjs and require entirely
points at value: consistency. allows codebase to evolve easily.

