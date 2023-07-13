import {
  eat,
  eatMatch,
  match,
  guard,
  Any,
  List,
  NamedLiteral,
} from '@cst-tokens/helpers/grammar/token';
import { objectEntries } from '@cst-tokens/helpers/object';
import { tok } from '@cst-tokens/helpers/shorthand';
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
      productions: [],
      aliases: objectEntries({ Node: [] }),
    },

    [sym.token]: {
      productions: productions({
        Keyword: NamedLiteral,
        Punctuator: NamedLiteral,
        StingStart: NamedLiteral,
        StringEnd: NamedLiteral,
        OpenTagOpen: NamedLiteral,
        OpenTagClose: NamedLiteral,
        OpenTagSelfClose: NamedLiteral,
        CloseTag: NamedLiteral,
        TokenTagOpen: NamedLiteral,
        TokenTagClose: NamedLiteral,

        *Document() {
          yield eat(tok`OpenTagOpen:<`);
          yield eat(PN`!`);
          yield eat(KW`doctype`);
          yield eat(WS);
          yield eat(KW`cstml`);
          yield eatMatch(WS);
          yield eat(tok`OpenTagSelfClose:>`);
          yield eat(tok`Fragment`);
        },

        *Fragment() {
          while (yield eat(Any(WS, tok`Token`, tok`Element`)));
        },

        *Element() {
          yield eat(tok`OpenTagOpen:<`);

          yield eat(tok`Name`);

          const sp = yield match(WS);
          if (sp) {
            yield* List({ value: { separator: WS, matchable: tok`Attribute` } });
          }

          if (yield eat(tok`OpenTagSelfClose:/>`)) {
            // done
          } else {
            yield eat(tok`OpenTagClose:>`);

            yield eat(tok`Fragment`);

            yield eat(tok`CloseTag:</>`);
          }
        },

        *Token() {
          debugger;
          yield eat(tok('TokenTagOpen', '<|', 'TokenTag'));
          yield eat(tok`Name`);
          yield eat(WS);
          yield eat(tok`String`);
          yield eat(tok('TokenTagClose', '|>', sym.parent));
        },

        *Attribute() {
          yield eat(tok`Name`);
          yield eatMatch(WS);
          yield eat(PN`=`);
          yield eatMatch(WS);
          yield eat(tok`String`);
        },

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
          qr = yield eatMatch(tok('StringStart', `'`, 'String:Single'));
          qr = qr || (yield eat(tok('StringStart', `"`, 'String:Double')));

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
          'Literal',
          'Name',
          'OpenTagOpen',
          'OpenTagClose',
          'OpenTagSelfClose',
          'CloseTag',
          'GapTag',
          'Escape',
          'EscapeCode',
          'Whitespace',
        ],
      }),
    },
  },
};
