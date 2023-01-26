import { str, concat } from 'iter-tools-es';
import { Grammar } from '@cst-tokens/grammar';
import {
  eat,
  match,
  eatMatch,
  pushLexicalContext,
  popLexicalContext,
  startNode,
  endNode,
  startToken,
  endToken,
} from '@cst-tokens/helpers/commands';
import { objectEntries } from '@cst-tokens/helpers/object';
import { ref, tok, chrs, any, PN, LPN, RPN, KW } from '@cst-tokens/helpers/shorthand';
import { LineBreak } from '@cst-tokens/helpers/descriptors';
import { Any, All } from '@cst-tokens/helpers/symbols';

const escapables = new Map(
  objectEntries({
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
    v: '\v',
    0: '\0',
  }),
);

const anyAndAllProductions = objectEntries({
  *[Any]({ takeables }) {
    for (const takeable of takeables) {
      if (yield eatMatch(takeable)) break;
    }
  },

  *[All]({ takeables }) {
    for (const takeable of takeables) {
      yield eat(takeable);
    }
  },
});

class GoodGrammar extends Grammar {
  constructor(grammar) {
    const { productions } = grammar;
    super({ ...grammar, productions: concat(productions, anyAndAllProductions) });
  }
}

export const tokenGrammar = new GoodGrammar({
  context: {
    allowsTrivia: (lexicalContext) => lexicalContext === 'Bare',
  },

  productions: objectEntries({
    LineBreak,

    *Separator() {
      yield pushLexicalContext('Separator');
      while (yield eatMatch(any(tok('Literal'), 'Comment', tok('StartNode'), tok('EndNode'))));
      yield popLexicalContext('Separator');
    },

    *Keyword({ value, getState }) {
      const { lexicalContext } = getState();
      yield startToken('Keyword');
      if (lexicalContext !== 'Bare') {
        throw new Error(`{lexicalContext: ${lexicalContext}} does not allow keywords`);
      }
      yield eat(chrs(value));
      yield endToken('Keyword');
    },

    *Literal({ getState }) {
      const { lexicalContext } = getState();
      yield startToken('Literal');
      if (lexicalContext === 'String:Single') {
        yield eat(/[^\\']+/y);
      } else if (lexicalContext === 'String:Double') {
        yield eat(/[^\\"]+/y);
      } else if (lexicalContext === 'Bare') {
        yield eat(/[$_\w][$_\w\d]*/y);
      } else {
        throw new Error(`{lexicalContext: ${lexicalContext}} does not allow literals`);
      }
      yield endToken('Literal');
    },

    *String() {
      let q; // quotation mark
      q = yield eat('StringStart');

      const lexicalContext = q === `'` ? 'String:Single' : 'String:Double';

      yield pushLexicalContext(lexicalContext);

      // parse here
      while ((yield eatMatch('Escape', 'EscapeCode')) || (yield eatMatch('Literal')));

      yield popLexicalContext(lexicalContext);

      yield eat([null, 'StringEnd', q]);
    },

    *StringStart() {
      yield startToken('StringStart');
      yield eat(/['"]/y);
      yield endToken('StringStart');
      yield pushLexicalContext('String');
    },

    *StringEnd({ value }) {
      if (/['"]$/y.test(value)) throw new Error('stringEndToken.value must be a quote');

      yield popLexicalContext('String');
      yield startToken('StringEnd');
      yield eat(chrs(value));
      yield endToken('StringEnd');
    },

    *Escape({ getState }) {
      const { lexicalContext } = getState();
      yield startToken('Escape');
      if (lexicalContext.startsWith('String')) {
        yield eat(chrs('\\'));
      } else {
        throw new Error(`{lexicalContext: ${lexicalContext}} does not define any escapes`);
      }
      yield endToken('Escape');
    },

    *EscapeCode({ getState }) {
      const { lexicalContext } = getState();
      yield startToken('EscapeCode');
      if (lexicalContext.startsWith('String')) {
        if (yield eatMatch(/u{\d{1,6}}/y)) {
          // break
        } else if (yield eatMatch(/u\d\d\d\d/y)) {
          // break
        } else if (yield eatMatch(/x\d\d/y)) {
          // break
        } else if (yield eatMatch(chrs(str(escapables.keys())))) {
          // break
        }
      } else {
        throw new Error(`{lexicalContext: ${lexicalContext}} does not define any escapes`);
      }
      yield endToken('EscapeCode');
    },
  }),
});

export const productions = objectEntries({
  *Program() {
    yield startNode('Program');
    while (yield eatMatch(ref`body:ImportDeclaration`));
    yield endNode();
  },

  *ImportDeclaration() {
    yield startNode('ImportDeclaration');
    yield eat(KW`import`);

    const special =
      (yield eatMatch(ref`specifiers:ImportNamespaceSpecifier`)) ||
      (yield eatMatch(ref`specifiers:ImportDefaultSpecifier`));

    if (special) {
      if (yield eatMatch(PN`,`)) {
        yield eat(LPN`{`);
        for (;;) {
          yield eat(ref`specifier:ImportSpecifier`);

          if (yield match(RPN`}`)) break;
          if (yield match(PN`,`, RPN`}`)) break;
          yield eat(PN`,`);
        }
        yield eatMatch(PN`,`);
        yield eat(RPN`}`);
      }
    }

    yield eat(KW`from`);

    yield eat(ref`source:StringLiteral`);
    yield eatMatch(PN`;`);
    yield endNode();
  },

  *ImportSpecifier() {
    yield startNode('ImportSpecifier');
    // Ref captured inside match is used only in the shorthand case
    yield match(ref`local:Identifier`);
    yield eat(ref`imported:Identifier`);
    yield eatMatch(KW`as`, ref`local:Identifier`);
    yield endNode();
  },

  *ImportDefaultSpecifier() {
    yield startNode('ImportDefaultSpecifier');
    yield eat(ref`local:Identifier`);
    yield endNode();
  },

  *ImportNamespaceSpecifier() {
    yield startNode('ImportNamespaceSpecifier');
    yield eat(PN`*`, KW`as`, ref`local:Identifier`);
    yield endNode();
  },

  *String() {
    yield startNode('String');
    yield eat(tok('String'));
    yield endNode();
  },

  *Identifier() {
    yield startNode('Identifier');
    yield pushLexicalContext('Identifier');

    while ((yield eatMatch('Escape', 'EscapeCode')) || (yield eatMatch('Literal')));

    yield popLexicalContext('Identifier');
    yield endNode();
  },
});

export default {
  grammars: {
    token: tokenGrammar,
    syntax: new GoodGrammar({
      aliases: objectEntries({
        Literal: ['StringLiteral'],
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

      productions,
    }),
  },
};
