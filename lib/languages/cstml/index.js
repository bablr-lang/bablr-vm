import { objectEntries } from '@bablr/helpers/object';
import { m, str, eat, match, eatMatch, guard, fail, disambiguate } from '@bablr/helpers/shorthand';
import { map, strFrom, productions } from '@bablr/helpers/iterable';
import { escapeCharacterClass } from '@bablr/helpers/regex';
import { List, Any, All, NamedLiteral } from '@bablr/helpers/productions';
import * as sym from '@bablr/helpers/symbols';

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
        Any,
        All,

        *Document() {
          yield eatMatch`<| |>`;
          yield eat`<DoctypeTag>`;
          yield eat`<Parsers>`;
          yield eat`<Node>`;
        },

        *DoctypeTag() {
          yield eat`<| Punctuator '<' startSpan='Tag' balanced='>' |>`;
          yield eat`<| Punctuator '!' |>`;
          yield eat`<| Keyword 'doctype' |>`;
          yield eat`<| |>`;
          yield eat`<| Keyword 'cstml' |>`;
          yield eatMatch`<| |>`;
          yield eat`<| Punctuator '>' endSpan='Tag' |>`;
        },

        *Parsers() {
          yield eat`<ParsersOpenTag>`;
          yield eat`<NodeCloseTag>`;
        },

        *ParsersOpenTag() {
          yield eat`<| Punctuator '<' startSpan='Tag' balanced='>' |>`;
          yield eat`<| Punctuator '!' |>`;
          yield eat`<| Keyword 'parsers' |>`;
          yield eat`<| Punctuator '>' endSpan='Tag' |>`;
        },

        *ParserTag() {
          yield eat`<| Punctuator '<' startSpan='Tag' balanced='>' |>`;
          yield eat`<Identifier path='name'>`;
          yield eat`<| |>`;
          yield eat`<String path='href'>`;
          yield eat`<| Punctuator '>' endSpan='Tag' |>`;
        },

        *ParsersCloseTag() {
          yield eat`<| Punctuator '</' startSpan='Tag' balanced='>' |>`;
          yield eatMatch`<Keyword value='parsers' path='type'>`;
          yield eatMatch`<| |>`;
          yield eat`<| Punctuator '>' endSpan='Tag' |>`;
        },

        *Fragment() {
          while (
            // TODO eat(null) is bad
            yield eatMatch(
              yield disambiguate([
                [m`<| |>`, /\s+/y],
                [m`<Element>`, '<'],
              ]),
            )
          );
        },

        *Element({ attrs }) {
          const [tag] = yield eat`<Tag ${attrs}>`;
          if (tag.type === 'NodeOpenTag') {
            yield eat`<Fragment>`;
            yield eat`<NodeCloseTag type=${tag.value.type}>`;
          } else if (tag.type === 'NodeCloseTag') {
            yield fail();
          }
        },

        *Tag() {
          const tag = yield disambiguate([
            [m`<TokenTag>`, str`<|`],
            [m`<NodeCloseTag>`, str`</`],
            [m`<NodeGapTag>`, str`<[`],
            [m`<NodeOpenTag>`, str`<`],
          ]);
          if (tag) yield eat(tag);
        },

        *Node() {
          const openTag = yield eat`<NodeOpenTag>`;
          yield eat`<Fragment>`;
          yield eat`<NodeCloseTag type=${openTag.value.type}>`;
        },

        *NodeOpenTag() {
          yield eat`<| Punctuator '<' startSpan='Tag' balanced='>' |>`;

          if (yield match`<+ All <| Identifier |> <| Punctuator ':' |>>`) {
            yield eat`<Identifier path='language'>`;
            yield eat`<| Punctuator ':' |>`;
            yield eat`<Identifier path='type'>>`;
          } else {
            yield eat`<Identifier path='type'>`;
          }

          const gapOpen =
            yield eatMatch`<|+ All <| |> <| Punctuator '[' startSpan='Gap' balanced=']' |> |>`;

          if (gapOpen) {
            yield eatMatch`<| |>`;
            yield eat`<Identifier path='gapType'>`;
            yield eatMatch`<| |>`;
            yield eat`<| Punctuator ']' endSpan='Gap' |>`;
          }

          yield eatMatch`<+ All <| |> <List separator=<| |> matchable=<Attribute path='attrs'>>>`;

          yield eat`<| Punctuator '>' endSpan='Tag' |>`;
        },

        *NodeCloseTag({ attrs }) {
          yield eat`<| Punctuator '</' startSpan='Tag' balanced='>' |>`;
          yield eatMatch`<Identifier value=${attrs.get('type')} path='type'>`;
          yield eatMatch`<| |>`;
          yield eat`<| Punctuator '>' endSpan='Tag' |>`;
        },

        *TokenTag() {
          yield eat`<| Punctuator '<|' startSpan='Tag' balanced='|>' |>`;
          yield eatMatch`<| |>`;
          yield eat`<Identifier path='type'>`;
          yield eatMatch`<+ All <| |> <List separator=<| |> matchable=<Attribute path='attrs'>>>`;
          yield eat`<| Punctuator '|>' endSpan='Tag' |>`;
        },

        *NodeGapTag() {
          yield eat`<| Punctuator '<' startSpan='Tag' balanced='>' |>`;

          yield eat`<| Punctuator '[' startSpan='Gap' balanced=']' |>`;
          yield eatMatch`<| |>`;
          yield eat`<Identifier path='type'>`;
          yield eatMatch`<| |>`;
          yield eat`<| Punctuator ']' endSpan='Gap' |>`;

          yield eatMatch`<+ All <| |> <List separator=<| |> matchable=<Attribute path='attrs'>>>`;

          yield eat`<| Punctuator '/>' endSpan='Tag' |>`;
        },

        *TokenGapTag() {
          yield eat`<| Punctuator '<|' startSpan='Tag' balanced='|>' |>`;
          yield eat`<| Punctuator '[' startSpan='Gap' balanced=']' |>`;
          yield eatMatch`<| |>`;
          yield eat`<Identifier path='type'>`;
          yield eatMatch`<| |>`;
          yield eat`<| Punctuator ']' endSpan='Gap' |>`;
          yield eatMatch`<|+ All <| |> <| String |> |>`;
          yield eatMatch`<+ All <| |> <List separator=<| |> matchable=<Attribute path='attrs'>>>`;
          yield eat`<| Punctuator '|>' endSpan='Tag' |>`;
        },

        *Attribute() {
          yield eat`<Identifier>`;
          yield eatMatch`<| |>`;
          yield eat`<| Punctuator '=' |>`;
          yield eatMatch`<| |>`;
          yield eat`<String>`;
        },

        *Identifier({ attrs }) {
          yield eat`<| Identifier ${attrs.get('value')} |>`;
        },

        *String() {
          yield eat`<| String |>`;
        },
      }),

      aliases: objectEntries({
        Tag: ['DoctypeTag', 'NodeOpenTag', 'NodeCloseTag', 'TokenTag', 'NodeGapTag'],
        [sym.node]: ['Tag', 'Attribute', 'Identifier', 'String'],
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
            if (yield eatMatch`/[${strFrom(map(escapeCharacterClass, escapables.keys()))}/`) {
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

        *Trivia({ state }) {
          const { span } = state;
          if (span === 'Bare' || span === 'Tag') {
            yield eat`/\s+/y`;
          } else if (span === 'TokenTag') {
            yield eat`/[ \t]+/y`;
          } else {
            throw new Error(`Trivia not supported in {span ${span}}`);
          }
        },
      }),

      aliases: objectEntries({
        [sym.token]: [
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
