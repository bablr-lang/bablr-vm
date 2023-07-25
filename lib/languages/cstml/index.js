import {
  eat,
  eatMatch,
  guard,
  disambiguate,
  List,
  NamedLiteral,
} from '@cst-tokens/helpers/grammar/token';
import { objectEntries } from '@cst-tokens/helpers/object';
import { tok, node } from '@cst-tokens/helpers/shorthand';
import { productions } from '@cst-tokens/helpers/productions';
import * as sym from '@cst-tokens/helpers/symbols';

const PN = (...args) => tok('Punctuator', String.raw(...args));
const KW = (...args) => tok('Keyword', String.raw(...args));
const WS = tok`Whitespace`;

// Mostly borrowed from JSON
const escapables = new Map(
  objectEntries({
    '"': '"',
    "'": "'",
    '\\': '\\',
    '/': '/',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
  }),
);

const str = (chrs) => {
  let str = '';
  for (const chr of chrs) str += chr;
  return str;
};

export default {
  grammars: {
    [sym.node]: {
      productions: productions({
        *Document() {
          yield eat(node`DoctypeTag`);
          yield eat(node`Fragment`);
        },

        *DoctypeTag() {
          yield eat(tok`OpenTagOpen:<`);
          yield eat(PN`!`);
          yield eat(KW`doctype`);
          yield eat(WS);
          yield eat(KW`cstml`);
          const sp = yield eatMatch(WS);
          if (sp) {
            const attrs = yield* List({
              value: { separator: WS, matchable: node`Attribute:attrs` },
            });

            // TODO move this to a separate validation layer so it doesn't completely stop parsing?
            // ultimately we want to present a gap
            if (!attrs.find(([key]) => key === 'validator')) {
              throw new Error('A document must define a validator');
            }
          }
          yield eat(tok`OpenTagSelfClose:>`);
        },

        *Fragment() {
          while (
            yield eat(
              yield disambiguate([
                [WS, /\s+/y],
                [node`Element`, '<'],
              ]),
            )
          );
        },

        *Element() {
          const [openTag] = yield eat(node`Tag`);
          if (openTag.name === 'OpenTag') {
            yield eat(node`Fragment`);
            yield eat(node('CloseTag', { name: openTag.name }));
          }
        },

        *Tag() {
          yield eat(
            yield disambiguate([
              [node`DoctypeTag`, '<!'],
              [node`TokenTag`, '<|'],
              [node`CloseTag`, '</'],
              [node`GapTag`, '<['],
              [node`OpenTag`, '<'],
            ]),
          );
        },

        *OpenTag() {
          yield eat(tok('OpenTagOpen', '<', 'Tag'));

          yield eat(node`Name`);

          const sp = yield eatMatch(WS);
          if (sp) {
            yield eat(tok('GapOpen', '[', 'Gap'));
            yield eatMatch(WS);
            yield eatMatch(node`Name`);
            yield eatMatch(WS);
            yield eat(tok('GapClose', ']', sym.parent));
          }

          const sp_ = yield eatMatch(WS);
          if (sp_) {
            yield* List({ value: { separator: WS, matchable: node`Attribute:attrs` } });
          }

          yield eat(tok('OpenTagClose', '>', sym.parent));
        },

        *CloseTag({ value: { name } }) {
          yield eat(tok('CloseTagOpen', '</', 'Tag'));
          yield eatMatch(tok('Name', name));
          yield eatMatch(WS);
          yield eat(tok('CloseTagClose', '>', sym.parent));
        },

        *TokenTag() {
          yield eat(tok('TokenTagOpen', '<|', 'Tag'));
          yield eatMatch(WS);
          yield eat(node`Name`);
          yield eat(WS);
          yield eat(tok`String`);
          const sp = yield eatMatch(WS);
          if (sp) {
            yield* List({ value: { separator: WS, matchable: node`Attribute:attrs` } });
          }
          yield eat(tok('TokenTagClose', '|>', sym.parent));
        },

        *GapTag() {
          yield eat(tok('OpenTagOpen', '<', 'Tag'));

          const go = yield eatMatch(tok('GapOpen', '[', 'Gap'));
          if (go) {
            yield eatMatch(WS);
            yield eatMatch(node`Name`);
            yield eatMatch(WS);
            yield eat(tok('GapClose', ']', sym.parent));
          }

          const sp = yield eatMatch(WS);
          if (sp) {
            yield* List({ value: { separator: WS, matchable: node`Attribute:attrs` } });
          }

          yield eat(tok('OpenTagSelfClose', '/>', sym.parent));
        },

        *Attribute() {
          yield eat(node`Name`);
          yield eatMatch(WS);
          yield eat(PN`=`);
          yield eatMatch(WS);
          yield eat(node`String`);
        },

        *Name() {
          yield eat(tok`Name`);
        },

        *String() {
          yield eat(tok`String`);
        },
      }),

      aliases: objectEntries({
        Tag: ['DoctypeTag', 'OpenTag', 'CloseTag', 'TokenTag', 'GapTag'],
        Node: ['Tag', 'Attribute', 'Name', 'String'],
      }),
    },

    [sym.token]: {
      productions: productions({
        Keyword: NamedLiteral,
        Punctuator: NamedLiteral,
        StingStart: NamedLiteral,
        StringEnd: NamedLiteral,
        GapOpen: NamedLiteral,
        GapClose: NamedLiteral,
        OpenTagOpen: NamedLiteral,
        OpenTagClose: NamedLiteral,
        OpenTagSelfClose: NamedLiteral,
        CloseTagOpen: NamedLiteral,
        CloseTagClose: NamedLiteral,
        TokenTagOpen: NamedLiteral,
        TokenTagClose: NamedLiteral,

        *Name() {
          yield eat(/\w+/y);
        },

        *Literal({ state: { lexicalContext } }) {
          if (lexicalContext === 'String:Single') {
            yield eat(/[^'\n]+/y);
          } else if (lexicalContext === 'String:Double') {
            yield eat(/[^"\n]+/y);
          } else {
            throw new Error();
          }
        },

        *EscapeSequence({ state: { lexicalContext } }) {
          if (!lexicalContext.startsWith('String')) {
            throw new Error(
              `{lexicalContext: ${lexicalContext}} does not define an escape sequence`,
            );
          }

          yield guard('\\');

          yield eat(tok`Escape`);
          yield eat(tok`EscapeCode`);
        },

        *Escape({ state: { lexicalContext } }) {
          if (lexicalContext.startsWith('String')) {
            throw new Error(`{lexicalContext: ${lexicalContext}} does not define an escape`);
          }

          yield eat('\\');
        },

        *EscapeCode({ state: { lexicalContext } }) {
          if (!lexicalContext.startsWith('String')) {
            throw new Error(`{lexicalContext: ${lexicalContext}} does not define any escape codes`);
          }

          if (yield eatMatch(/u{\d{1,6}}/y)) {
            // break
          } else if (yield eatMatch(/u\d\d\d\d/y)) {
            // break
          } else if (lexicalContext !== 'Bare') {
            if (yield eatMatch(str(escapables.keys()))) {
              // break
            }
          }
        },

        *String() {
          let qr;
          qr = yield eatMatch(tok('Punctuator', `'`, 'String:Single'));
          qr = qr || (yield eat(tok('Punctuator', `"`, 'String:Double')));

          while ((yield eatMatch(tok`Literal`)) || (yield eatMatch(tok`EscapeSequence`)));

          yield eat(tok('StringEnd', qr[0].value, sym.parent));
        },

        *Whitespace({ state: { lexicalContext } }) {
          if (lexicalContext === 'Bare' || lexicalContext === 'Tag') {
            yield eat(/\s+/y);
          } else if (lexicalContext === 'TokenTag') {
            yield eat(/[ \t]+/y);
          } else {
            throw new Error(`Whitespace not supported in {lexicalContext ${lexicalContext}}`);
          }
        },
      }),

      aliases: objectEntries({
        Token: [
          'Punctuator',
          'Keyword',
          'StringStart',
          'StringEnd',
          'GapOpen',
          'GapClose',
          'Literal',
          'Name',
          'OpenTagOpen',
          'OpenTagClose',
          'OpenTagSelfClose',
          'TokenTagOpen',
          'TokenTagClose',
          'Escape',
          'EscapeCode',
          'Whitespace',
        ],
      }),
    },
  },
};
