import { str } from 'iter-tools-es';
import {
  eatChrs as eat,
  matchChrs as match,
  eatMatchChrs as eatMatch,
} from '@cst-tokens/helpers/grammar';
import { WithToken } from '@cst-tokens/helpers/metaproductions';
import { objectEntries } from '@cst-tokens/helpers/object';
import { chrs, tok } from '@cst-tokens/helpers/shorthand';
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

function* NamedLiteral({ value }) {
  yield eat(chrs(value));
}

export const productions = objectEntries({
  Punctuator: NamedLiteral,
  LeftPunctuator: NamedLiteral,
  RightPunctuator: NamedLiteral,
  CommentStart: NamedLiteral,
  CommentEnd: NamedLiteral,

  *Separator() {
    yield eat(tok`Trivia`);
    while (yield eatMatch(tok`Trivia`));
  },

  *BlockComment() {
    yield eat(tok`CommentStart:/*`);

    yield eatMatch(tok`Literal`);

    yield eat(tok`CommentEnd:*/`);
  },

  *LineComment() {
    yield eat(tok`CommentStart://`);

    yield eatMatch(tok`Literal`);

    if (yield match(tok(EOF))) return;

    yield eatMatch(tok`CommentEnd:\n`);
  },

  *Whitespace() {
    yield eat(/\s+/y);
  },

  *Keyword({ value, lexicalContext }) {
    if (lexicalContext !== 'Bare') {
      throw new Error(`{lexicalContext: ${lexicalContext}} does not allow keywords`);
    }
    yield eat(chrs(value));
  },

  *String() {
    let q; // quotation mark
    q = yield eatMatch(tok`StringStart:'`);
    q = q || (yield eat(tok`StringStart:"`));

    while ((yield eatMatch('Escape', 'EscapeCode')) || (yield eatMatch('Literal')));

    yield eat(tok`StringEnd:${q}`);
  },

  *Literal({ lexicalContext, getState }) {
    if (lexicalContext === 'String:Single') {
      yield eat(/[^\\']+/y);
    } else if (lexicalContext === 'String:Double') {
      yield eat(/[^\\"]+/y);
    } else if (lexicalContext === 'Bare') {
      const lastType = getState().result?.type;
      const isFirst = !lastType || lastType === 'EscapeCode' || lastType === 'Literal';
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
    while ((yield eatMatch(tok`Escape`, tok`EscapeCode`)) || (yield eatMatch(tok`Literal`)));
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

export const aliases = objectEntries({
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
});

export const context = {
  *transition(lexicalContext, boundaryToken) {
    if (lexicalContext === 'Bare') {
      yield* bareTransitions.get(boundaryToken);
    } else {
      throw new Error();
    }
  },
};

export const enhancers = [WithToken];
