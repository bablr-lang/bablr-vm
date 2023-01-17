import { map, objectEntries, str } from 'iter-tools-es';
import { Grammar, Fragment } from '@cst-tokens/grammar';
import {
  eat,
  match,
  eatMatch,
  eatChrs,
  eatMatchChrs,
  pushLexicalContext,
  popLexicalContext,
  startNodeInnerRange,
  endNodeInnerRange,
  startNodeOuterRange,
  endNodeOuterRange,
} from '@cst-tokens/helpers/commands';
import * as sym from '@cst-tokens/helpers/symbols';
import { Bag } from '@cst-tokens/helpers/meta-productions';
import { ref, PN, LPN, RPN, KW } from '@cst-tokens/helpers/shorthand';
import { LineBreak } from '@cst-tokens/helpers/descriptors';

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

export const tokenGrammar = new Grammar({
  *matchTrivium() {
    yield eatChrs(/[ \t]+/y);
  },

  productions: objectEntries({
    LineBreak,

    *Keyword({ lexicalContext, value }) {
      if (lexicalContext === 'Bare') {
        yield eatChrs(value);
      } else {
        throw new Error(`{lexicalContext: ${lexicalContext}} does not allow keywords`);
      }
    },

    *Literal({ lexicalContext }) {
      if (lexicalContext === 'String:Single') {
        yield eatChrs(/[^\\']+/y);
      } else if (lexicalContext === 'String:Double') {
        yield eatChrs(/[^\\"]+/y);
      } else if (lexicalContext === 'Bare') {
        yield eatChrs(/[$_\w][$_\w\d]*/y);
      } else {
        throw new Error(`{lexicalContext: ${lexicalContext}} does not allow literals`);
      }
    },

    *StringStart() {
      yield pushLexicalContext('Separator');
      yield eatChrs(/['"]/y);
    },

    *StringEnd({ value }) {
      if (/['"]$/y.test(value)) throw new Error('stringEndToken.value must be a quote');

      yield eatChrs(value);
      yield popLexicalContext('Separator');
    },

    *Escape({ lexicalContext }) {
      if (lexicalContext.startsWith('String')) {
        yield eatChrs('\\');
      } else {
        throw new Error(`{lexicalContext: ${lexicalContext}} does not define any escapes`);
      }
    },

    *EscapeCode({ lexicalContext }) {
      if (lexicalContext.startsWith('String')) {
        if (yield eatMatchChrs(/u{\d{1,6}}/y)) {
          // break
        } else if (yield eatMatchChrs(/u\d\d\d\d/y)) {
          // break
        } else if (yield eatMatchChrs(/x\d\d/y)) {
          // break
        } else if (yield eatMatchChrs(str(escapables.keys()))) {
          // break
        }
      } else {
        throw new Error(`{lexicalContext: ${lexicalContext}} does not define any escapes`);
      }
    },
  }),
});

export function* Separator({ getState }) {
  const result = getState().source
    ? yield eat(Bag(['Whitespace', 'LineBreak']))
    : yield eat('Whitespace');

  return result;
}

export const WithSeparator = (production) => {
  const name = `WithSeparator_${production.name}`;
  return {
    *[name](props) {
      const { getState } = props;
      const rootState = getState();
      let s = rootState;

      const generator = production(props);
      let current = generator.next();

      let p;

      while (!current.done) {
        const cmd = current.value;
        const cause = cmd.error;
        let returnValue;

        cmd.error = cause && new Error(undefined, { cause });

        switch (cmd.type) {
          case sym.startLexicalContext: {
            const name = cmd.value;
            if (name === 'Identifier') {
              const spaceIsAllowed = s.source.lexicalContext === 'Base';
            }

            returnValue = yield cmd;
            break;
          }

          case sym.eatProduction:
          case sym.matchProduction:
          case sym.eatMatchProduction: {
            returnValue = yield cmd;
            break;
          }

          case sym.eat:
          case sym.match:
          case sym.eatMatch: {
            const name = cmd.value;

            // const spaceIsAllowed = s.source.lexicalContext === 'Base';

            // const spaceIsNecessary = ;

            if (spaceIsAllowed) {
              if (spaceIsNecessary) {
                yield eat('Separator');
              } else {
                yield eatMatch('Separator');
              }
            }

            let s = getState();

            if (s.path !== s.source.path) {
              yield startNodeInnerRange();
            }

            returnValue = yield cmd;
            break;
          }

          default:
            returnValue = yield cmd;
            break;
        }

        s = getState();
        current = generator.next(returnValue);
      }

      yield endNodeInnerRange();
    },
  }[name];
};

export const productions = objectEntries({
  *[Fragment]() {
    yield eat(ref`fragment:Node`);
    yield eatMatch(Separator);
  },

  *Program() {
    while (yield eatMatch(ref`body:ImportDeclaration`));
  },

  *ImportDeclaration() {
    yield eat(KW`import`);

    const special =
      (yield eatMatch(ref`specifiers:ImportNamespaceSpecifier`)) ||
      (yield eatMatch(ref`specifiers:ImportDefaultSpecifier`));

    if (special) {
      if (yield eatMatch(PN`,`)) {
        yield eat(LPN`{`);
        for (;;) {
          yield eat(ref`specifier:ImportSpecifier`);

          yield eatMatch(Separator);
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
    let q; // quotation mark
    q = yield eat('StringStart');

    const lexicalContext = q === `'` ? 'String:Single' : 'String:Double';

    yield pushLexicalContext(lexicalContext);

    // parse here
    while ((yield eatMatch('Escape', 'EscapeCode')) || (yield eatMatch('Literal')));

    yield popLexicalContext(lexicalContext);

    yield eat([null, 'StringEnd', q]);
  },

  *Identifier() {
    yield pushLexicalContext('Identifier');

    while ((yield eatMatch('Escape', 'EscapeCode')) || (yield eatMatch('Literal')));

    yield popLexicalContext('Identifier');
  },

  Separator,
});

export default {
  grammars: {
    token: tokenGrammar,
    syntax: new Grammar({
      aliases: objectEntries({
        Literal: ['StringLiteral'],
        Node: map((kv) => kv[0], productions),
      }),

      productions,
    }),
  },
};
