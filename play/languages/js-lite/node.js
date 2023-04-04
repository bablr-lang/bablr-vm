import { eat, eatMatch } from '@cst-tokens/helpers/grammar/node';
import { objectEntries } from '@cst-tokens/helpers/object';
import { tok, node } from '@cst-tokens/helpers/shorthand';
import { WithNode } from '@cst-tokens/helpers/metaproductions';
import { annotatedProductions } from '@cst-tokens/helpers/productions';
import * as sym from '@cst-tokens/helpers/symbols';

import { WithWhitespace } from './trivia.js';

const PN = (...args) => tok('Punctuator', String.raw(...args));
const LPN = (...args) => tok('LeftPunctuator', String.raw(...args));
const RPN = (...args) => tok('RightPunctuator', String.raw(...args));
const KW = (...args) => tok('Keyword', String.raw(...args));

export const productionType = sym.node;

export const productions = annotatedProductions({
  *Program() {
    while (yield eatMatch(node`Statement:body`));
  },

  *BlockStatement() {
    yield eat(LPN`{`);
    while (yield eatMatch(node`Statement:body`));
    yield eat(RPN`}`);
  },

  *ExpressionStatement() {
    yield eat(node`Expression:expression`);
    yield eatMatch(PN`;`);
  },

  *ImportDeclaration() {
    yield eat(KW`import`);

    const special = yield eatMatch(node`ImportSpecialSpecifier:specifiers`);

    const brace = special ? yield eatMatch(PN`,`, LPN`{`) : yield eatMatch(LPN`{`);
    if (brace) {
      yield eat(
        node('ValueList', null, { separator: PN`,`, matchable: node`ImportSpecifier:specifiers` }),
      );

      yield eat(RPN`}`);
    }

    if (special || brace) {
      yield eat(KW`from`);
    }

    yield eat(node`StringLiteral:source`);
    yield eatMatch(PN`;`);
  },

  *ImportSpecifier() {
    yield eat(node`Identifier:imported`);
    let as = yield eatMatch(KW`as`);
    if (as) yield eat(node`Identifier:local`);
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

  *CallExpression() {
    yield eat(node`Expression:callee`);
    yield eat(LPN`(`);
    yield eat(node('ValueList', null, { separator: PN`,`, matchable: node`Expression:arguments` }));
    yield eat(RPN`)`);
  },

  *MemberExpression() {
    yield eat(node`Expression:object`);
    yield eat(PN`.`);
    yield eat(node`Identifier`);
  },

  *ArrowFunctionExpression() {
    let body;
    yield eat(LPN`(`);
    yield eat(node('ValueList', null, { separator: PN`,`, matchable: node`Expression:params` }));
    yield eat(RPN`)`);
    yield eat(PN`=>`);
    body = yield eatMatch(node`BlockStatement:body`);
    if (!body) yield eatMatch(node`Expresssion:body`);
  },

  *Identifier() {
    yield eat(tok`Identifier`);
  },

  *ValueList({
    value: { separator, matchable, allowHoles = false, allowTrailingSeparator = true },
  }) {
    let sep, item;
    for (;;) {
      item = yield eatMatch(matchable);
      if (item || allowTrailingSeparator) {
        sep = yield eatMatch(separator);
      }
      if (!(sep || allowHoles)) break;
    }
  },
});

export const aliases = objectEntries({
  Statement: ['ImportDeclaration', 'ExpressionStatement', 'BlockStatement'],
  Expression: [
    'Literal',
    'Identifier',
    'ArrowFunctionExpression',
    'MemberExpression',
    'CallExpression',
  ],
  Literal: ['StringLiteral'],
  ImportSpecialSpecifier: ['ImportDefaultSpecifier', 'ImportNamespaceSpecifier'],
  Node: ['Program', 'Statement', 'ImportSpecifier', 'ImportSpecialSpecifier'],
});

export const enhancers = [WithWhitespace, WithNode];
