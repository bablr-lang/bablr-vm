import { eat, match, eatMatch } from '@cst-tokens/helpers/grammar';
import { objectEntries } from '@cst-tokens/helpers/object';
import { tok, node } from '@cst-tokens/helpers/shorthand';
import { WithNode } from '@cst-tokens/helpers/metaproductions';

import { WithWhitespace } from './whitespace.js';

const _ = 'Separator';
const PN = (value) => tok`Punctuator:${value}`;
const LPN = (value) => tok`LeftPunctuator:${value}`;
const RPN = (value) => tok`RightPunctuator:${value}`;
const KW = (value) => tok`Keyword:${value}`;

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
        yield eat(node`ImportSpecifier:specifier`);

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

  *String() {
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
