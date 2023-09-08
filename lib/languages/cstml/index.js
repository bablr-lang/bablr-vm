// @ts-nocheck

import objectEntries from 'iter-tools-es/methods/object-entries';
import map from 'iter-tools-es/methods/map';
import strFrom from 'iter-tools-es/methods/str';
import { str, spam, eat, eatMatch, guard, fail, disambiguate } from '@bablr/helpers/shorthand';
import * as productions from '@bablr/helpers/productions';
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

// TODO fixme
export const escapeCharacterClass = (str) => str.replace(/]\\-/g, (r) => `\\${r}`);

const attributeFromEntry = ([k, v]) => spam.Attribute`${k}=${v}`;

class NodeGrammar {
  constructor() {
    this.aliases = new Map([
      [
        sym.node,
        new Set([
          'Document',
          'DoctypeTag',
          'ParsersOpenTag',
          'ParserTag',
          'ParsersCloseTag',
          'NodeOpenTag',
          'NodeCloseTag',
          'TokenTag',
          'NodeGapTag',
          'TokenGapTag',
          'Attribute',
        ]),
      ],
      [
        'Tag',
        new Set([
          'DoctypeTag',
          'ParsersOpenTag',
          'ParserTag',
          'ParsersCloseTag',
          'NodeOpenTag',
          'NodeCloseTag',
          'TokenTag',
          'NodeGapTag',
          'TokenGapTag',
        ]),
      ],
    ]);
  }

  Any(...args) {
    return productions.Any(...args);
  }

  All(...args) {
    return productions.All(...args);
  }

  List(...args) {
    return productions.List(...args);
  }

  // @Node
  *Document() {
    yield eatMatch`<| |>`;
    yield eat`<DoctypeTag>`;
    yield eatMatch`<| |>`;
    yield eat`<Parsers>`;
    yield eatMatch`<| |>`;
    yield eat`<Node>`;
    yield eatMatch`<| |>`;
  }

  // @Node
  // @Cover('Tag')
  *DoctypeTag() {
    yield eat`<| Punctuator '<' startSpan='Tag' balanced='>' |>`;
    yield eat`<| Punctuator '!' |>`;
    yield eat`<| Keyword 'doctype' |>`;
    yield eat`<| |>`;
    yield eat`<| Keyword 'cstml' |>`;
    yield eatMatch`<| |>`;
    yield eat`<| Punctuator '>' endSpan='Tag' |>`;
  }

  *Parsers() {
    yield eat`<ParsersOpenTag>`;
    while (eatMatch`<All {[ <| |> <ParserTag> ]}>`);
    yield eatMatch`<| |>`;
    yield eat`<ParsersCloseTag>`;
  }

  // @Node
  // @Cover('Tag')
  *ParsersOpenTag() {
    yield eat`<| Punctuator '<' startSpan='Tag' balanced='>' |>`;
    yield eat`<| Punctuator '!' |>`;
    yield eat`<| Keyword 'parsers' |>`;
    yield eat`<| Punctuator '>' endSpan='Tag' |>`;
  }

  // @Node
  // @Cover('Tag')
  *ParserTag() {
    yield eat`<| Punctuator '<' startSpan='Tag' balanced='>' |>`;
    yield eat`<Identifier path='name'>`;
    yield eat`<| |>`;
    yield eat`<String path='href'>`;
    yield eat`<| Punctuator '>' endSpan='Tag' |>`;
  }

  // @Node
  // @Cover('Tag')
  *ParsersCloseTag() {
    yield eat`<| Punctuator '</' startSpan='Tag' balanced='>' |>`;
    yield eatMatch`<Keyword value='parsers' path='type'>`;
    yield eatMatch`<| |>`;
    yield eat`<| Punctuator '>' endSpan='Tag' |>`;
  }

  *Fragment() {
    while (
      // TODO eat(null) is bad
      yield eatMatch(
        yield disambiguate([
          [spam`<| |>`, /\s+/y],
          [spam`<Element>`, '<'],
        ]),
      )
    );
  }

  *Element({ attrs }) {
    const [tag] = yield eat`<Tag ${[...attrs].map(attributeFromEntry)}>`;
    if (tag.type === 'NodeOpenTag') {
      yield eat`<Fragment>`;
      yield eat`<NodeCloseTag type=${tag.value.type}>`;
    } else if (tag.type === 'NodeCloseTag') {
      yield fail();
    }
  }

  *Tag() {
    const tag = yield disambiguate([
      [spam`<TokenGapTag>`, str`<|[`],
      [spam`<TokenTag>`, str`<|`],
      [spam`<NodeGapTag>`, str`<[`],
      [spam`<NodeOpenTag>`, str`<`],
      [spam`<NodeCloseTag>`, str`</`],
    ]);
    if (tag) yield eat(tag);
  }

  *Node() {
    const openTag = yield eat`<NodeOpenTag>`;
    yield eat`<Fragment>`;
    yield eat`<NodeCloseTag type=${openTag.value.type}>`;
  }

  // @Node
  // @Cover('Tag')
  *NodeOpenTag() {
    yield eat`<| Punctuator '<' startSpan='Tag' balanced='>' |>`;

    yield eat`<Identifier path='type'>`;

    const gapOpen = yield eatMatch`<| All {[
        <| |>
        <| Punctuator '[' startSpan='Gap' balanced=']' |>
      } |>`;

    if (gapOpen) {
      yield eatMatch`<| |>`;
      yield eat`<Identifier path='gapType'>`;
      yield eatMatch`<| |>`;
      yield eat`<| Punctuator ']' endSpan='Gap' |>`;
    }

    yield eatMatch`<Attributes>`;

    yield eat`<| Punctuator '>' endSpan='Tag' |>`;
  }

  // @Node
  // @Cover('Tag')
  *NodeCloseTag({ attrs }) {
    yield eat`<| Punctuator '</' startSpan='Tag' balanced='>' |>`;
    yield eatMatch`<Identifier value=${attrs.get('type')} path='type'>`;
    yield eatMatch`<| |>`;
    yield eat`<| Punctuator '>' endSpan='Tag' |>`;
  }

  // @Node
  // @Cover('Tag')
  *TokenTag() {
    yield eat`<| Punctuator '<|' startSpan='Tag' balanced='|>' |>`;
    yield eatMatch`<| |>`;
    yield eat`<Identifier path='type'>`;
    yield eatMatch`<Attributes>`;
    yield eat`<| Punctuator '|>' endSpan='Tag' |>`;
  }

  // @Node
  // @Cover('Tag')
  *NodeGapTag() {
    yield eat`<| Punctuator '<' startSpan='Tag' balanced='>' |>`;
    yield eat`<| Punctuator '[' startSpan='Gap' balanced=']' |>`;
    yield eatMatch`<| |>`;
    yield eat`<Identifier path='type'>`;
    yield eatMatch`<| |>`;
    yield eat`<| Punctuator ']' endSpan='Gap' |>`;
    yield eatMatch`<Attributes>`;
    yield eat`<| Punctuator '/>' endSpan='Tag' |>`;
  }

  // @Node
  // @Cover('Tag')
  *TokenGapTag() {
    yield eat`<| Punctuator '<|' startSpan='Tag' balanced='|>' |>`;
    yield eat`<| Punctuator '[' startSpan='Gap' balanced=']' |>`;
    yield eatMatch`<| |>`;
    yield eat`<Identifier path='type'>`;
    yield eatMatch`<| |>`;
    yield eat`<| Punctuator ']' endSpan='Gap' |>`;
    yield eatMatch`<| All {[ <| |> <| String |> ]} |>`;
    yield eatMatch`<Attributes>`;
    yield eat`<| Punctuator '|>' endSpan='Tag' |>`;
  }

  *Attributes() {
    yield eatMatch`<All {[
        <| |>
        <List { separator=<| |> matchable=<Attribute path='attrs'> }>
      ]}>`;
  }

  // @Node
  *Attribute() {
    yield eat`<| Identifier |>`;
    yield eatMatch`<| |>`;
    yield eat`<| Punctuator '=' |>`;
    yield eatMatch`<| |>`;
    yield eat`<String>`;
  }

  *Identifier() {
    yield eat`<| Identifier |>`;
  }

  *String() {
    yield eat`<| String |>`;
  }
}

class TokenGrammar {
  constructor() {
    this.aliases = new Map([
      [
        sym.token,
        new Set([
          'Keyword',
          'Punctuator',
          'Identifier',
          'Literal',
          'Escape',
          'EscapeCode',
          'Trivia',
        ]),
      ],
    ]);
  }

  Any(...args) {
    return productions.Any(...args);
  }

  All(...args) {
    return productions.All(...args);
  }

  // @Token
  *Keyword({ value }) {
    yield eat(value);
  }

  // @Token
  *Punctuator({ value }) {
    yield eat(value);
  }

  // @Token
  *Identifier() {
    yield eat`/\w+/y`;
  }

  // @Token
  *Literal({ state: { span } }) {
    if (span === 'String:Single') {
      yield eat`/[^'\n]+/y`;
    } else if (span === 'String:Double') {
      yield eat`/[^"\n]+/y`;
    } else {
      throw new Error(`{span: ${span}} does not allow literals`);
    }
  }

  *EscapeSequence({ state: { span } }) {
    if (!span.startsWith('String')) {
      throw new Error(`{span: ${span}} does not define an escape sequence`);
    }

    yield guard('\\');

    yield eat`<| Escape |>`;
    yield eat`<| EscapeCode |>`;
  }

  // @Token
  *Escape({ state: { span } }) {
    if (span.startsWith('String')) {
      throw new Error(`{span: ${span}} does not define an escape`);
    }

    yield eat('\\');
  }

  // @Token
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
  }

  *String() {
    let lq = eat`<| Any {[
        <| Punctuator "'" startSpan='String:Single' balanced="'" |>
        <| Punctuator '"' startSpan='String:Double' balanced='"' |>
      ]} |>`;

    while (yield eatMatch`<| Any {[ <| Literal |> <| EscapeSequence |> ]} |>`);

    yield eat`<| Punctuator ${lq.value} endSpan=${lq.startSpan} |>`;
  }

  // @Token
  *Trivia({ state }) {
    const { span } = state;
    if (span === 'Bare' || span === 'Tag') {
      yield eat`/\s+/y`;
    } else if (span === 'TokenTag') {
      yield eat`/[ \t]+/y`;
    } else {
      throw new Error(`Trivia not supported in {span ${span}}`);
    }
  }
}

export const grammars = {
  [sym.node]: NodeGrammar,
  [sym.token]: TokenGrammar,
};
