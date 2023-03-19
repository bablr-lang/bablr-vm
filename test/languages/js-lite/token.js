import { str } from 'iter-tools-es';
import { eat, match, eatMatch, fail } from '@cst-tokens/helpers/grammar/token';
import { WithToken } from '@cst-tokens/helpers/metaproductions';
import { objectEntries } from '@cst-tokens/helpers/object';
import { chrs, tok } from '@cst-tokens/helpers/shorthand';
import { EOF } from '@cst-tokens/helpers/symbols';
import * as sym from '@cst-tokens/helpers/symbols';

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

const triviaProductionFor = (chrs) => {
  if (chrs === '/*') {
    return 'BlockComment';
  } else if (chrs === '//') {
    return 'LineComment';
  } else if (!chrs.trim()) {
    return 'Whitespace';
  } else {
    throw new Error('Unknown trivia production');
  }
};

function* NamedLiteral({ value }) {
  yield eat(chrs(value));
}

export const productionType = sym.token;

export const productions = objectEntries({
  Punctuator: NamedLiteral,
  LeftPunctuator: NamedLiteral,
  RightPunctuator: NamedLiteral,

  *Trivia() {
    const chrs = yield match(/\/\*|\/\/|\s/y);
    if (chrs) {
      yield eat(tok(triviaProductionFor(chrs)));
    } else {
      yield fail();
    }
  },

  *Separator() {
    while (yield match(/\/\*|\/\/|\s/y)) {
      yield eat(tok`Trivia`);
    }
  },

  *BlockComment() {
    yield eat(tok('LeftPunctuator', `/*`, 'Comment:Block'));

    yield eatMatch(tok`Literal`);

    yield eat(tok('RightPunctuator', `*/`, sym.parent));
  },

  *LineComment({ state }) {
    yield eat(tok('LeftPunctuator', `//`, 'Comment:Line'));

    yield eatMatch(tok`Literal`);

    if (state.testCurrent(EOF)) return;

    yield eat(tok('RightPunctuator', `\n`, sym.parent));
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
    let qr;
    qr = yield eatMatch(tok('LeftPunctuator', `'`, 'String:Single'));
    qr = qr || (yield eat(tok('LeftPunctuator', `"`, 'String:Double')));

    while ((yield eatMatch(tok`Escape`, tok`EscapeCode`)) || (yield eatMatch(tok`Literal`)));

    yield eat(tok('RightPunctuator', qr[0].value, sym.parent));
  },

  *Literal({ lexicalContext, state }) {
    if (lexicalContext === 'String:Single') {
      yield eat(/[^\\']+/y);
    } else if (lexicalContext === 'String:Double') {
      yield eat(/[^\\"]+/y);
    } else if (lexicalContext === 'Bare') {
      const lastType = state.result?.type;
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
    if (lexicalContext === 'Bare' || lexicalContext.startsWith('String')) {
      yield eat(chrs('\\'));
    } else {
      throw new Error(`{lexicalContext: ${lexicalContext}} does not define any escapes`);
    }
  },

  *EscapeCode({ lexicalContext }) {
    if (lexicalContext.startsWith('String') || lexicalContext === 'Bare') {
      if (yield eatMatch(/u{\d{1,6}}/y)) {
        // break
      } else if (yield eatMatch(/u\d\d\d\d/y)) {
        // break
      } else if (lexicalContext !== 'Bare') {
        if (yield eatMatch(/x\d\d/y)) {
          // break
        } else if (yield eatMatch(chrs(str(escapables.keys())))) {
          // break
        }
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
    'Escape',
    'EscapeCode',
  ],
  Comment: ['BlockComment', 'LineComment'],
  Trivia: ['Comment', 'Whitespace'],
});

export const enhancers = [WithToken];
