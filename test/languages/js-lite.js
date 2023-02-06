import { str, map, concat, compose } from 'iter-tools-es';
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
import { Any, All } from '@cst-tokens/helpers/symbols';
import * as sym from '@cst-tokens/helpers/symbols';

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

export const WithToken = ([key, production]) => {
  const name = `WithToken_${production.name}`;
  return [
    key,
    {
      *[name](props, grammar) {
        if (grammar.is('Token', key)) {
          yield startToken();
          yield* production(props);
          yield endToken();
        } else {
          yield* production(props);
        }
      },
    }[name],
  ];
};

export const tokenGrammar = new GoodGrammar({
  productions: objectEntries({
    *Separator() {
      yield pushLexicalContext('Separator');
      while (yield eatMatch(any('Literal', 'Comment', 'StartNode', 'EndNode')));
      yield popLexicalContext('Separator');
    },

    *Keyword({ value, lexicalContext }) {
      yield startToken('Keyword', value);
      if (lexicalContext !== 'Bare') {
        throw new Error(`{lexicalContext: ${lexicalContext}} does not allow keywords`);
      }
      yield eat(chrs(value));
      yield endToken();
    },

    *LeftPunctuator({ value }) {
      yield startToken('LeftPunctuator', value);
      yield { type: 'debug' };
      yield eat(chrs(value));
      yield endToken();
    },

    *Literal({ lexicalContext }) {
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
      yield endToken();
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
      let q; // quotation mark
      yield startToken('StringStart');
      q = yield eat(/['"]/y);
      yield endToken();
    },

    *StringEnd({ value }) {
      if (/['"]$/y.test(value)) throw new Error('stringEndToken.value must be a quote');

      yield startToken('StringEnd');
      yield eat(chrs(value));
      yield endToken();
    },

    *Escape({ lexicalContext }) {
      yield startToken('Escape');
      if (lexicalContext.startsWith('String')) {
        yield eat(chrs('\\'));
      } else {
        throw new Error(`{lexicalContext: ${lexicalContext}} does not define any escapes`);
      }
      yield endToken();
    },

    *EscapeCode({ lexicalContext }) {
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
      yield endToken();
    },
  }),
});

const spaceDelimitedTypes = ['Identifier', 'Keyword'];

export const WithWhitespace = ([key, production]) => {
  const name = `WithWhitespace_${production.name}`;

  return [
    key,
    {
      *[name](props) {
        const { getState } = props;

        const generator = production(props);
        let current = generator.next();
        let state;

        while (!current.done) {
          const cmd = current.value;
          const cause = cmd.error;
          let returnValue;

          cmd.error = cause && new Error(undefined, { cause });

          state = getState();

          switch (cmd.type) {
            case sym.eat:
            case sym.match:
            case sym.eatMatch: {
              const { type } = cmd.value;

              const spaceIsAllowed = state.lexicalContext === 'Base';

              if (spaceIsAllowed) {
                const spaceIsNecessary =
                  !!lastType &&
                  spaceDelimitedTypes.includes(lastType) &&
                  spaceDelimitedTypes.includes(type);

                if (spaceIsNecessary) {
                  yield eat('Separator');
                } else {
                  yield eatMatch('Separator');
                }
              }

              returnValue = yield cmd;
              break;
            }

            default:
              returnValue = yield cmd;
              break;
          }

          current = generator.next(returnValue);
        }
      },
    }[name],
  ];
};

export const WithNode = ([type, production]) => {
  const name = `WithNode_${production.name}`;
  return [
    type,
    {
      *[name](props, grammar) {
        if (grammar.is('Node', type)) {
          yield startNode();
          yield* production(props);
          yield endNode();
        } else {
          yield* production(props);
        }
      },
    }[name],
  ];
};

export const syntaxGrammar = new GoodGrammar({
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

  productions: map(
    compose(WithNode /*WithWhitespace*/),
    objectEntries({
      *Program() {
        while (yield eatMatch(ref`body:ImportDeclaration`));
      },

      *ImportDeclaration() {
        yield eat(KW`import`);

        const special = yield eatMatch(ref`specifiers:ImportSpecialSpecifier`);

        yield { type: 'debug' };

        const brace = special ? yield eatMatch(PN`,`, LPN`{`) : yield eatMatch(LPN`{`);
        if (brace) {
          for (;;) {
            yield eat(ref`specifier:ImportSpecifier`);

            if (yield match(RPN`}`)) break;
            if (yield match(PN`,`, RPN`}`)) break;
            yield eat(PN`,`);
          }
          yield eatMatch(PN`,`);
          yield eat(RPN`}`);
          yield eat(KW`from`);
        }

        yield eat(ref`source:StringLiteral`);
        yield eatMatch(PN`;`);
      },

      *ImportSpecifier() {
        // Ref captured inside match is used only in the shorthand case
        yield match(ref`local:Identifier`);
        yield eat(ref`imported:Identifier`);
        yield eatMatch(KW`as`, ref`local:Identifier`);
      },

      *ImportDefaultSpecifier() {
        yield eat(ref`local:Identifier`);
      },

      *ImportNamespaceSpecifier() {
        yield eat(PN`*`, KW`as`, ref`local:Identifier`);
      },

      *String() {
        yield eat(tok('String'));
      },

      *Identifier() {
        yield pushLexicalContext('Identifier');

        while ((yield eatMatch('Escape', 'EscapeCode')) || (yield eatMatch('Literal')));

        yield popLexicalContext('Identifier');
      },
    }),
  ),
});

export default {
  grammars: {
    token: tokenGrammar,
    syntax: syntaxGrammar,
  },
};
