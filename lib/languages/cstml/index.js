import { objectEntries } from '@bablr/helpers/object';
import { m, str, re, eat, eatMatch, guard, fail, disambiguate } from '@bablr/helpers/shorthand';
import { map } from '@bablr/helpers/iterable';
import { escapeCharacterClass } from '@bablr/helpers/regex';
import { productions } from '@bablr/helpers/productions';
import * as sym from '@bablr/helpers/symbols';
import { List, NamedLiteral } from '@bablr/helpers/grammar';

const strFrom = (chrs) => {
  let str = '';
  for (const chr of chrs) str += chr;
  return str;
};

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
          yield eatMatch`< >`;
          yield eat`<DoctypeTag>`;
          yield eat`<Element type="cstml">`;
        },

        *DoctypeTag() {
          yield eat`<| Punctuator '<' startSpan='Tag:Doctype' balanced='>' |>`;
          yield eat`<| Punctuator '!' |>`;
          yield eat`<| Keyword 'doctype' |>`;
          yield eat`< >`;
          yield eat`<| Keyword 'cstml' |>`;
          yield eatMatch`< >`;
          yield eat`<| Punctuator '>' endSpan='Tag:Doctype' |>`;
        },

        *Fragment() {
          while (
            // TODO eat(null) is bad
            yield eatMatch(
              yield disambiguate([
                [m`< >`, /\s+/y],
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

          const gapOpen =
            yield eatMatch`<|+ All < > <| Punctuator '[' startSpan='Gap' balanced=']' |> |>`;

          if (gapOpen) {
            yield eatMatch`< >`;
            yield eat`<Identifier path='gapType'>`;
            yield eatMatch`< >`;
            yield eat`<| Punctuator ']' endSpan='Gap' |>`;
          }

          yield eatMatch`<+ All < > <List separator=< > matchable=<Attribute path='attrs'>>>`;

          yield eat`<| Punctuator '>' endSpan='Tag:Open' |>`;
        },

        *CloseTag({ attrs }) {
          yield eat`<| Punctuator '</' startSpan='Tag:Close' balanced='>' |>`;
          yield eatMatch`<Identifier value=${attrs.get('type')} path='type'>`;
          yield eatMatch`< >`;
          yield eat`<| Punctuator '>' endSpan='Tag:Close' |>`;
        },

        *TokenTag() {
          yield eat`<| Punctuator '<|' startSpan='Tag:Token' balanced='|>' |>`;
          yield eatMatch`< >`;
          yield eat`<Identifier path='type'>`;
          yield eatMatch`<+ All < > <List separator=< > matchable=<Attribute path='attrs'>>>`;
          yield eat`<| Punctuator '|>' endSpan='Tag:Token' |>`;
        },

        *GapTag() {
          yield eat`<| Punctuator '<' startSpan='Tag:Gap' balanced='>' |>`;

          yield eat`<| Punctuator '[' startSpan='Gap' balanced=']' |>`;
          yield eatMatch`< >`;
          yield eat`<Identifier path='type'>`;
          yield eatMatch`< >`;
          yield eat`<| Punctuator ']' endSpan='Gap' |>`;

          yield eatMatch`<+ All < > <List separator=< > matchable=<Attribute path='attrs'>>>`;

          yield eat`<| Punctuator '/>' endSpan='Tag:Gap' |>`;
        },

        *GapTokenTag() {
          yield eat`<| Punctuator '<|' startSpan='Tag:Token' balanced='|>' |>`;
          yield eat`<| Punctuator '[' startSpan='Gap' balanced=']' |>`;
          yield eatMatch`< >`;
          yield eat`<Identifier path='type'>`;
          yield eatMatch`< >`;
          yield eat`<| Punctuator ']' endSpan='Gap' |>`;
          yield eatMatch`<|+ All < > <| String |> |>`;
          yield eatMatch`<+ All < > <List separator=< > matchable=<Attribute path='attrs'>>>`;
          yield eat`<| Punctuator '|>' endSpan='Tag:Token' |>`;
        },

        *Attribute() {
          yield eat`<Identifier>`;
          yield eatMatch`< >`;
          yield eat`<| Punctuator '=' |>`;
          yield eatMatch`< >`;
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
            yield eat(re`/[^'\n]+/y`);
          } else if (span === 'String:Double') {
            yield eat(re`/[^"\n]+/y`);
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

          if (yield eatMatch(re`/u{\d{1,6}}/y`)) {
            // break
          } else if (yield eatMatch(re`/u\d\d\d\d/y`)) {
            // break
          } else if (span !== 'Bare') {
            if (yield eatMatch(re`/[${strFrom(map(escapeCharacterClass, escapables.keys()))}/`)) {
              // break
            }
          }
        },

        *String() {
          let lq = eat`<|+ Any
            <| Punctuator "'" startSpan='String:Single' balanced="'" |>
            <| Punctuator '"' startSpan='String:Double' balanced='"' |>
          |>`;

          while (yield eatMatch`<|+ Any <| Literal |> <| EscapeSequence |> |>`);

          yield eat`<| Punctuator ${lq.value} endSpan=${lq.startSpan} |>`;
        },

        *Whitespace({ state }) {
          const { span } = state;
          if (span === 'Bare' || span === 'Tag') {
            yield eat(re`/\s+/y`);
          } else if (span === 'TokenTag') {
            yield eat(re`/[ \t]+/y`);
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
