import { eat, match, eatMatch } from '@cst-tokens/helpers/grammar/node';
import { objectEntries } from '@cst-tokens/helpers/object';
import { tok, node, bnd } from '@cst-tokens/helpers/shorthand';
import { nodeBoundsEnhancer } from '@cst-tokens/helpers/enhancers';
import { productions } from '@cst-tokens/helpers/productions';
import * as sym from '@cst-tokens/helpers/symbols';

import { triviaEnhancer } from './enhancers/trivia.js';

const PN = (...args) => tok('Punctuator', String.raw(...args));
const LPN = (...args) => tok('LeftPunctuator', String.raw(...args));
const RPN = (...args) => tok('RightPunctuator', String.raw(...args));
const KW = (...args) => tok('Keyword', String.raw(...args));

const valueList = (props) => node('ValueList', null, props);

export const grammar = {
  productions: productions({
    *Program() {
      yield eat(node`StatementList`);
    },

    *StatementList() {
      while (!(yield match(bnd(sym.EOF)))) {
        yield eat(node`Statement:body`);
      }
    },

    *BlockStatement() {
      yield eat(tok('Block', { start: PN`{`, body: node`StatementList:body`, end: PN`}` }));
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
        yield eat(valueList({ separator: PN`,`, matchable: node`ImportSpecifier:specifiers` }));

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
      yield eat(valueList({ separator: PN`,`, matchable: node`Expression:arguments` }));
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
      yield eat(valueList({ separator: PN`,`, matchable: node`Expression:params` }));
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
  }),

  aliases: objectEntries({
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
    Node: ['Program', 'Statement', 'Expression', 'ImportSpecifier', 'ImportSpecialSpecifier'],
  }),

  enhancers: [triviaEnhancer, nodeBoundsEnhancer],
};

export default grammar;
