import { map, compose } from 'iter-tools-es';
import { Grammar, eat, match, eatMatch } from '@cst-tokens/helpers/grammar';
import { objectEntries } from '@cst-tokens/helpers/object';
import { tok, prod } from '@cst-tokens/helpers/shorthand';
import { WithNode, WithLogging } from '@cst-tokens/helpers/metaproductions';

import { WithWhitespace } from './whitespace.js';

export const _ = 'Separator';
export const PN = (value) => tok`Punctuator:${value}`;
export const LPN = (value) => tok`LeftPunctuator:${value}`;
export const RPN = (value) => tok`RightPunctuator:${value}`;
export const KW = (value) => tok`Keyword:${value}`;

export const productions = objectEntries({
  *Program() {
    while (yield eatMatch(prod`body:ImportDeclaration`));
  },

  *ImportDeclaration() {
    yield eat(KW`import`);

    const special = yield eatMatch(prod`specifiers:ImportSpecialSpecifier`);

    const brace = special ? yield eatMatch(PN`,`, LPN`{`) : yield eatMatch(LPN`{`);
    if (brace) {
      for (;;) {
        yield eat(prod`specifier:ImportSpecifier`);

        if (yield match(RPN`}`)) break;
        if (yield match(PN`,`, RPN`}`)) break;
        yield eat(PN`,`);
      }
      yield eatMatch(PN`,`);
      yield eat(RPN`}`);
      yield eat(KW`from`);
    }

    yield eat(prod`source:StringLiteral`);
    yield eatMatch(PN`;`);
  },

  *ImportSpecifier() {
    yield eat(prod`imported:Identifier`);
    yield eatMatch(KW`as`, prod`local:Identifier`);
  },

  *ImportDefaultSpecifier() {
    yield eat(prod`local:Identifier`);
  },

  *ImportNamespaceSpecifier() {
    yield eat(PN`*`, KW`as`, prod`local:Identifier`);
  },

  *String() {
    yield eat(tok`String`);
  },

  *Identifier() {
    yield eat(tok`Identifier`);
  },
});

export const syntaxGrammar = new Grammar({
  aliases: objectEntries({
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
  }),

  productions: map(compose(WithLogging, WithWhitespace, WithNode), productions),
});
