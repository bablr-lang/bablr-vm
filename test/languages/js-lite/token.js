import { str, map } from 'iter-tools-es';
import { Grammar, eat, match, eatMatch } from '@cst-tokens/helpers/grammar';
import { WithToken } from '@cst-tokens/helpers/metaproductions';
import { objectEntries } from '@cst-tokens/helpers/object';
import { chrs, prod } from '@cst-tokens/helpers/shorthand';
import { LexicalBoundary, EOF } from '@cst-tokens/helpers/symbols';

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

const bareTransitions = new Map(
  objectEntries({
    "'": ["'", 'String:Single', "'"],
    '"': ['"', 'String:Double', '"'],
    '/*': ['/*', 'Comment:Block', '*/'],
    '//': ['//', 'Comment:Line', '\n'],
    '/': ['/', 'Regex', '/'],
  }),
);

export const productions = objectEntries({
  *Separator() {
    yield eat(prod`Trivia`);
    while (yield eatMatch(prod`Trivia`));
  },

  *BlockComment() {
    yield eatMatch(prod`CommentStart:/*`);

    yield eatMatch(prod`Literal`);

    yield eatMatch(prod`CommentEnd:*/`);
  },

  *LineComment() {
    yield eatMatch(prod`CommentStart://`);

    yield eatMatch(prod`Literal`);

    if (yield match(prod(EOF))) return;

    yield eatMatch(prod`CommentEnd:\n`);
  },

  *Whitespace() {
    yield eat(/\w+/y);
  },

  *Keyword({ value, lexicalContext }) {
    if (lexicalContext !== 'Bare') {
      throw new Error(`{lexicalContext: ${lexicalContext}} does not allow keywords`);
    }
    yield eat(chrs(value));
  },

  *Punctuator({ value }) {
    yield eat(chrs(value));
  },

  *LeftPunctuator({ value }) {
    yield eat(chrs(value));
  },

  *RightPunctuator({ value }) {
    yield eat(chrs(value));
  },

  *String() {
    let q; // quotation mark
    q = yield eatMatch(prod`StringStart:'`);
    q = q || (yield eat(prod`StringStart:"`));

    while ((yield eatMatch('Escape', 'EscapeCode')) || (yield eatMatch('Literal')));

    yield eat(prod`StringEnd:${q}`);
  },

  *Literal({ lexicalContext, getState, context }) {
    if (lexicalContext === 'String:Single') {
      yield eat(/[^\\']+/y);
    } else if (lexicalContext === 'String:Double') {
      yield eat(/[^\\"]+/y);
    } else if (lexicalContext === 'Bare') {
      const lastType = getState().result?.type;
      const isFirst = !lastType || lastType === 'EscapeCode' || lastType === 'Literal';
      // it may be appropriate for the literal to contain only a digit, e.g. foo\u{42}9
      if (isFirst) {
        yield eat(/[$_\w][$_\w\d]*/y);
      } else {
        yield eat(/[$_\w\d]+/y);
      }
    } else {
      throw new Error(`{lexicalContext: ${lexicalContext}} does not allow literals`);
    }
  },

  *Identifier() {
    while ((yield eatMatch(prod`Escape`, prod`EscapeCode`)) || (yield eatMatch(prod`Literal`)));
  },

  *Escape({ lexicalContext }) {
    if (lexicalContext.startsWith('String')) {
      yield eat(chrs('\\'));
    } else {
      throw new Error(`{lexicalContext: ${lexicalContext}} does not define any escapes`);
    }
  },

  *EscapeCode({ lexicalContext }) {
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
      throw new Error(`{lexicalContext: ${lexicalContext}} does not define any escape codes`);
    }
  },
});

export const tokenGrammar = new Grammar({
  aliases: objectEntries({
    Token: [
      'Whitespace',
      'Keyword',
      'Punctuator',
      'LeftPunctuator',
      'RightPunctuator',
      'Literal',
      'StringStart',
      'StringEnd',
      'Escape',
      'EscapeCode',
    ],
    Comment: ['BlockComment', 'LineComment'],
    Trivia: ['Comment', 'Whitespace'],
    [LexicalBoundary]: ['CommentStart', 'CommentEnd', 'StringStart', 'StringEnd'],
  }),
  context: {
    *transition(lexicalContext, boundaryToken) {
      if (lexicalContext === 'Bare') {
        yield* bareTransitions.get(boundaryToken);
      } else {
        throw new Error();
      }
    },
  },
  productions: map(WithToken, productions),
});
