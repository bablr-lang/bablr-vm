import {
  eat,
  eatMatch,
  guard,
  disambiguate,
  NamedLiteral,
} from '@cst-tokens/helpers/grammar/token';
import { objectEntries } from '@cst-tokens/helpers/object';
import { tag as t } from '@cst-tokens/helpers/shorthand';
import { productions } from '@cst-tokens/helpers/productions';
import * as sym from '@cst-tokens/helpers/symbols';

const str = (chrs) => {
  let str = '';
  for (const chr of chrs) str += chr;
  return str;
};

const _ = t`<| Whitespace |>`;

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

export default {
  grammars: {
    [sym.node]: {
      productions: productions({
        *Document() {
          yield eatMatch(_);
          yield eat`<DoctypeTag>`;
          yield eat`<Fragment>`;
        },

        *DoctypeTag() {
          yield eat`<| Punctuator '<' startSpan='Tag:Doctype' |>`;
          yield eat`<| Punctuator '!' |>`;
          yield eat`<| Keyword 'doctype' |>`;
          yield eat(_);
          yield eat`<| Keyword 'cstml' |>`;
          const sp = yield eatMatch(_);
          if (sp) {
            yield eat`<List separator=${_} matchable=${t`<Attribute path='attrs'>`}>`;
          }
          yield eat`<| Punctuator '>' endSpan='Tag:Doctype' |>`;
        },

        *Fragment() {
          while (
            // TODO eat(null) is bad
            yield eat(
              yield disambiguate([
                [_, /\s+/y],
                [t`<Element>`, '<'],
              ]),
            )
          );
        },

        *Element() {
          const [openTag] = yield eat`<Tag>`;
          if (openTag.type === 'OpenTag') {
            yield eat`<Fragment>`;
            yield eat`<CloseTag type=${openTag.type}>`;
          }
        },

        *Tag() {
          yield eat(
            yield disambiguate([
              [t`<DoctypeTag>`, '<!'],
              [t`<TokenTag>`, '<|'],
              [t`<CloseTag>`, '</'],
              [t`<GapTag>`, '<['],
              [t`<OpenTag>`, '<'],
            ]),
          );
        },

        *OpenTag() {
          yield eat`<| Punctuator '<' startSpan='Tag:Open' |>`;

          yield eat`<Identifier path='type'>`;

          const sp = yield eatMatch(_);
          if (sp) {
            yield eat`<| Punctuator '[' startSpan='Gap' |>`;
            yield eatMatch(_);
            yield eatMatch`<Identifier path='gapType'`;
            yield eatMatch(_);
            yield eat`<| Punctuator ']' endSpan='Gap' |>`;
          }

          const sp_ = yield eatMatch(_);
          if (sp_) {
            yield eat`<List separator=${_} matchable=${t`<Attribute path='attrs'>`}>`;
          }

          yield eat`<| Punctuator '>' endSpan='Tag:Open' |>`;
        },

        *CloseTag({ attrs: { type } }) {
          yield eat`<| Punctuator '</' startSpan='Tag:Close' |>`;
          yield eatMatch`<Identifier value=${type} path='type'>`;
          yield eatMatch(_);
          yield eat`<| Punctuator '>' endSpan='Tag:Close' |>`;
        },

        *TokenTag() {
          yield eat`<| Punctuator '<|' startSpan='Tag:Token' |>`;
          yield eatMatch(_);
          yield eat`<Identifier path='type'>`;
          yield eat(_);
          yield eat`<| String |>`;
          const sp = yield eatMatch(_);
          if (sp) {
            yield eat`<List separator=${_} matchable=${t`<Attribute path='attrs'>`}>`;
          }
          yield eat`<| Punctuator '|>' endSpan='Tag:Token' |>`;
        },

        *GapTag() {
          yield eat`<| Punctuator '<' startSpan='Tag:Gap' |>`;

          const go = yield eatMatch`<| Punctuator '[' startSpan='Gap' |>`;
          if (go) {
            yield eatMatch(_);
            yield eatMatch`<Identifier path='gapType'>`;
            yield eatMatch(_);
            yield eat`<| Punctuator ']' endSpan='Gap' |>`;
          }

          const sp = yield eatMatch(_);
          if (sp) {
            yield eat`<List separator=${_} matchable=${t`<Attribute path='attrs'>`}>`;
          }

          yield eat`<| Punctuator '/>' endSpan='Tag:Gap' |>`;
        },

        *Attribute() {
          yield eat`<Identifier>`;
          yield eatMatch(_);
          yield eat`<| Punctuator '=' |>`;
          yield eatMatch(_);
          yield eat`<String>`;
        },

        *Identifier() {
          yield eat`<Identifier>`;
        },

        *String() {
          yield eat`<| String |>`;
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

        *Identifier({ attrs: { value } }) {
          const result = yield value ? eat(value) : eat`/\w+/y`;
          if (result && !value && !/\w+/y.test(result)) {
            throw new Error('value can only match valid identifiers');
          }
        },

        *Literal({ state: { span } }) {
          if (span === 'String:Single') {
            yield eat`/[^'\n]+/y`;
          } else if (span === 'String:Double') {
            yield eat`/[^"\n]+/y`;
          } else {
            throw new Error();
          }
        },

        *EscapeSequence({ state: { span } }) {
          if (!span.startsWith('String')) {
            throw new Error(`{span: ${span}} does not define an escape sequence`);
          }

          yield guard('\\');

          yield eat`<| Escape |>`;
          yield eat`<| EscapeCode |>`;
        },

        *Escape({ state: { span } }) {
          if (span.startsWith('String')) {
            throw new Error(`{span: ${span}} does not define an escape`);
          }

          yield eat('\\');
        },

        *EscapeCode({ state: { span } }) {
          if (!span.startsWith('String')) {
            throw new Error(`{span: ${span}} does not define any escape codes`);
          }

          if (yield eatMatch`/u{\d{1,6}}/y`) {
            // break
          } else if (yield eatMatch`/u\d\d\d\d/y`) {
            // break
          } else if (span !== 'Bare') {
            if (yield eatMatch(str(escapables.keys()))) {
              // break
            }
          }
        },

        *String() {
          let lq;
          lq = (yield eatMatch`<| Punctuator "'" startSpan='String:Single' |>`)?.[0];
          lq = lq || (yield eat`<| Punctuator '"' startSpan='String:Double' |>`)?.[0];

          while ((yield eatMatch`<| Literal |>`) || (yield eatMatch`<| EscapeSequence |>`));

          yield eat`<| Punctuator ${lq.value} endSpan=${lq.startSpan} |>`;
        },

        *Whitespace({ state: { span } }) {
          if (span === 'Bare' || span === 'Tag') {
            yield eat`/\s+/y`;
          } else if (span === 'TokenTag') {
            yield eat`/[ \t]+/y`;
          } else {
            throw new Error(`Whitespace not supported in {span ${span}}`);
          }
        },
      }),

      aliases: objectEntries({
        Token: [
          'Punctuator',
          'Keyword',
          'Literal',
          'Identifier',
          'Escape',
          'EscapeCode',
          'Whitespace',
        ],
      }),
    },
  },
};
