import { objectEntries } from '@cst-tokens/helpers/object';
import { m, str, eat, eatMatch, guard, fail, disambiguate } from '@cst-tokens/helpers/shorthand';
import { map } from '@cst-tokens/helpers/iterable';
import { escapeCharacterClass } from '@cst-tokens/helpers/regex';
import { productions } from '@cst-tokens/helpers/productions';
import * as sym from '@cst-tokens/helpers/symbols';
import { List, NamedLiteral } from '@cst-tokens/helpers/grammar';

const strFrom = (chrs) => {
  let str = '';
  for (const chr of chrs) str += chr;
  return str;
};

const _ = m`<| Whitespace |>`;

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
        List,

        *Document() {
          yield eatMatch(_);
          yield eat`<DoctypeTag>`;
          yield eat`<Element type="cstml">`;
        },

        *DoctypeTag() {
          yield eat`<| Punctuator '<' startSpan='Tag:Doctype' balanced='>' |>`;
          yield eat`<| Punctuator '!' |>`;
          yield eat`<| Keyword 'doctype' |>`;
          yield eat(_);
          yield eat`<| Keyword 'cstml' |>`;
          yield eatMatch(_);
          yield eat`<| Punctuator '>' endSpan='Tag:Doctype' |>`;
        },

        *Fragment() {
          while (
            // TODO eat(null) is bad
            yield eatMatch(
              yield disambiguate([
                [_, /\s+/y],
                [m`<Element>`, '<'],
              ]),
            )
          );
        },

        *Element({ attrs }) {
          const [tag] = yield eat`<Tag ${attrs}>`;
          if (tag.type === 'OpenTag') {
            yield eat`<Fragment>`;
            yield eat`<CloseTag type=${tag.type}>`;
          } else if (tag.type === 'CloseTag') {
            yield fail();
          }
        },

        *Tag({ attrs }) {
          const tag = yield disambiguate([
            [m`<TokenTag>`, str`<|`],
            [m`<CloseTag>`, str`</`],
            [m`<GapTag>`, str`<[`],
            [m`<OpenTag>`, str`<`],
          ]);
          if (tag) {
            yield eat(attrs ? { ...tag, value: { ...tag.value, attrs } } : tag);
          }
        },

        *OpenTag({ attrs }) {
          yield eat`<| Punctuator '<' startSpan='Tag:Open' balanced='>' |>`;

          const valueAttr = attrs.get('type') ? [['value', attrs.get('type')]] : [];

          yield eat`<Identifier path='type' ${valueAttr}>`;

          const sp = yield eatMatch(_);
          if (sp) {
            yield eat`<| Punctuator '[' startSpan='Gap' balanced=']' |>`;
            yield eatMatch(_);
            yield eatMatch`<Identifier path='gapType'>`;
            yield eatMatch(_);
            yield eat`<| Punctuator ']' endSpan='Gap' |>`;
          }

          const sp_ = yield eatMatch(_);
          if (sp_) {
            yield eat`<List separator=${_} matchable=${m`<Attribute path='attrs'>`}>`;
          }

          yield eat`<| Punctuator '>' endSpan='Tag:Open' |>`;
        },

        *CloseTag({ attrs }) {
          yield eat`<| Punctuator '</' startSpan='Tag:Close' balanced='>' |>`;
          yield eatMatch`<Identifier value=${attrs.get('type')} path='type'>`;
          yield eatMatch(_);
          yield eat`<| Punctuator '>' endSpan='Tag:Close' |>`;
        },

        *TokenTag() {
          yield eat`<| Punctuator '<|' startSpan='Tag:Token' balanced='|>' |>`;
          yield eatMatch(_);
          yield eat`<Identifier path='type'>`;
          yield eat(_);
          yield eat`<| String |>`;
          const sp = yield eatMatch(_);
          if (sp) {
            yield eat`<List separator=${_} matchable=${m`<Attribute path='attrs'>`}>`;
          }
          yield eat`<| Punctuator '|>' endSpan='Tag:Token' |>`;
        },

        *GapTag() {
          yield eat`<| Punctuator '<' startSpan='Tag:Gap' balanced='>' |>`;

          const go = yield eatMatch`<| Punctuator '[' startSpan='Gap' balanced=']' |>`;
          if (go) {
            yield eatMatch(_);
            yield eatMatch`<Identifier path='type'>`;
            yield eatMatch(_);
            yield eat`<| Punctuator ']' endSpan='Gap' |>`;
          }

          const sp = yield eatMatch(_);
          if (sp) {
            yield eat`<List separator=${_} matchable=${m`<Attribute path='attrs'>`}>`;
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

        *Identifier({ value }) {
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
            throw new Error(`{span: ${span}} does not allow literals`);
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
            if (yield eatMatch(`/[${strFrom(map(escapeCharacterClass, escapables.keys()))}/`)) {
              // break
            }
          }
        },

        *String() {
          let lq;
          lq = (yield eatMatch`<| Punctuator "'" startSpan='String:Single' balanced="'" |>`)?.[0];
          lq = lq || (yield eat`<| Punctuator '"' startSpan='String:Double' balanced='"' |>`)?.[0];

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
