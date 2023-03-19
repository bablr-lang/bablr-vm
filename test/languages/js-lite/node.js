import { eat, match, eatMatch } from '@cst-tokens/helpers/grammar/node';
import { objectEntries } from '@cst-tokens/helpers/object';
import { tok, node } from '@cst-tokens/helpers/shorthand';
import { WithNode } from '@cst-tokens/helpers/metaproductions';
import * as sym from '@cst-tokens/helpers/symbols';

import { WithWhitespace } from './whitespace.js';

const PN = (...args) => tok('Punctuator', String.raw(...args));
const LPN = (...args) => tok('LeftPunctuator', String.raw(...args));
const RPN = (...args) => tok('RightPunctuator', String.raw(...args));
const KW = (...args) => tok('Keyword', String.raw(...args));

export const productionType = sym.node;

export const productions = objectEntries({
  *Program() {
    while (yield eatMatch(node`ImportDeclaration:body`));
  },

  *ImportDeclaration() {
    yield eat(KW`import`);

    const special = yield eatMatch(node`ImportSpecialSpecifier:specifiers`);

    const brace = special ? yield eatMatch(PN`,`, LPN`{`) : yield eatMatch(LPN`{`);
    if (brace) {
      for (;;) {
        yield eat(node`ImportSpecifier:specifiers`);

        if (yield match(RPN`}`)) break;
        if (yield match(PN`,`, RPN`}`)) break;
        yield eat(PN`,`);
      }
      yield eatMatch(PN`,`);
      yield eat(RPN`}`);
      yield eat(KW`from`);
    }

    yield eat(node`StringLiteral:source`);
    yield eatMatch(PN`;`);
  },

  *ImportSpecifier() {
    yield eat(node`Identifier:imported`);

    yield eatMatch(KW`as`, node`Identifier:local`);
  },

  *ImportDefaultSpecifier() {
    yield eat(node`Identifier:local`);
  },

  *ImportNamespaceSpecifier() {
    yield eat(PN`*`, KW`as`, node`Identifier:local`);
  },

  *StringLiteral() {
    yield eat(tok`String`);
  },

  *Identifier() {
    yield eat(tok`Identifier`);
  },
});

export const aliases = objectEntries({
  Literal: ['StringLiteral'],
  ImportSpecialSpecifier: ['ImportDefaultSpecifier', 'ImportNamespaceSpecifier'],
  Node: [
    'Program',
    'ImportDeclaration',
    'ImportSpecifier',
    'ImportDefaultSpecifier',
    'ImportNamespaceSpecifier',
    'String',
    'Identifier',
  ],
});

export const enhancers = [WithWhitespace, WithNode];
