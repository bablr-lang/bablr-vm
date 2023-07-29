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
          yield eatMatch(WS);
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
              attrs: { separator: WS, matchable: node`Attribute:attrs` },
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
            // TODO eat(null) is bad
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
          if (openTag.type === 'OpenTag') {
            yield eat(node`Fragment`);
            yield eat(node('CloseTag', { type: openTag.type }));
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
          yield eat(tok('OpenTagOpen', { value: '<', startSpan: 'Tag' }));

          yield eat(node('Identifier', { path: 'type' }));

          const sp = yield eatMatch(WS);
          if (sp) {
            yield eat(tok('GapOpen', { value: '[', startSpan: 'Gap' }));
            yield eatMatch(WS);
            yield eatMatch(node('Identifier', { path: 'gapType' }));
            yield eatMatch(WS);
            yield eat(tok('GapClose', { value: ']', endSpan: 'Gap' }));
          }

          const sp_ = yield eatMatch(WS);
          if (sp_) {
            yield* List({ attrs: { separator: WS, matchable: node`Attribute:attrs` } });
          }

          yield eat(tok('OpenTagClose', { value: '>', endSpan: 'Tag' }));
        },

        *CloseTag({ attrs: { type } }) {
          yield eat(tok('CloseTagOpen', { value: '</', startSpan: 'Tag' }));
          yield eatMatch(node('Identifier', { value: type, path: 'type' }));
          yield eatMatch(WS);
          yield eat(tok('CloseTagClose', { value: '>', endSpan: 'Tag' }));
        },

        *TokenTag() {
          yield eat(tok('TokenTagOpen', { value: '<|', startSpan: 'Tag' }));
          yield eatMatch(WS);
          yield eat(node('Identifier', { path: 'type' }));
          yield eat(WS);
          yield eat(tok`String`);
          const sp = yield eatMatch(WS);
          if (sp) {
            yield* List({ attrs: { separator: WS, matchable: node`Attribute:attrs` } });
          }
          yield eat(tok('TokenTagClose', { value: '|>', endSpan: 'Tag' }));
        },

        *GapTag() {
          yield eat(tok('OpenTagOpen', '<', 'Tag'));

          const go = yield eatMatch(tok('GapOpen', { value: '[', startSpan: 'Gap' }));
          if (go) {
            yield eatMatch(WS);
            yield eatMatch(node('Identifier', { path: 'gapType' }));
            yield eatMatch(WS);
            yield eat(tok('GapClose', { value: ']', endSpan: 'Gap' }));
          }

          const sp = yield eatMatch(WS);
          if (sp) {
            yield* List({ attrs: { separator: WS, matchable: node`Attribute:attrs` } });
          }

          yield eat(tok('OpenTagSelfClose', { value: '/>', endSpan: 'Gap' }));
        },

        *Attribute() {
          yield eat(node`Identifier`);
          yield eatMatch(WS);
          yield eat(PN`=`);
          yield eatMatch(WS);
          yield eat(node`String`);
        },

        *Identifier() {
          yield eat(tok`Identifier`);
        },

        *String() {
          yield eat(tok`String`);
        },
      }),

      aliases: objectEntries({
        Tag: ['DoctypeTag', 'OpenTag', 'CloseTag', 'TokenTag', 'GapTag'],
        Node: ['Tag', 'Attribute', 'Identifier', 'String'],
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

        *Identifier({ attrs: { value } }) {
          const result = yield eat(value || /\w+/y);
          if (result && !value && !/\w+/y.test(result)) {
            throw new Error('value can only match valid identifiers');
          }
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
          qr = yield eatMatch(tok('Punctuator', { value: `'`, startSpan: 'String:Single' }));
          qr = qr || (yield eat(tok('Punctuator', { value: `"`, startSpan: 'String:Double' })));

          while ((yield eatMatch(tok`Literal`)) || (yield eatMatch(tok`EscapeSequence`)));

          yield eat(tok('StringEnd', { value: qr[0].value, endSpan: span }));
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
          'Identifier',
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
