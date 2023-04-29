import { str } from 'iter-tools-es';
import { eat, eatMatch, fail, guard, match } from '@cst-tokens/helpers/grammar/token';
import { tokenBoundsEnhancer } from '@cst-tokens/helpers/enhancers';
import { productions } from '@cst-tokens/helpers/productions';
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

const triviaPattern = /\s|\/\*|\/\//y;

export const grammar = {
  productions: productions({
    Punctuator: NamedLiteral,
    LeftPunctuator: NamedLiteral,
    RightPunctuator: NamedLiteral,
    CommentStart: NamedLiteral,
    CommentEnd: NamedLiteral,

    *Trivia({ value: { guardMatch } = {} }) {
      let guardMatch_ = guardMatch;

      if (guardMatch === undefined) {
        guardMatch_ = yield guard(triviaPattern);
      }

      yield eat(tok(triviaProductionFor(guardMatch_)));
    },

    *Separator({ value: { guardMatch } = {} }) {
      let guardMatch_ = guardMatch;

      if (guardMatch === undefined) {
        guardMatch_ = yield guard(triviaPattern);
      }

      while (guardMatch) {
        yield eat(tok('Trivia', { guardMatch: guardMatch_ }));
        guardMatch = yield match(triviaPattern);
      }
    },

    *BlockComment() {
      yield eat(tok('CommentStart', `/*`, 'Comment:Block'));

      yield eatMatch(tok`Literal`);

      yield eat(tok('CommentEnd', `*/`, sym.parent));
    },

    *LineComment({ state }) {
      yield eat(tok('CommentStart', `//`, 'Comment:Line'));

      yield eatMatch(tok`Literal`);

      if (state.testCurrent(EOF)) return;

      yield eat(tok('CommentEnd', `\n`, sym.parent));
    },

    *Whitespace() {
      yield eat(/\s+/y);
    },

    *Keyword({ value, state: { lexicalContext } }) {
      if (lexicalContext !== 'Bare') {
        throw new Error(`{lexicalContext: ${lexicalContext}} does not allow keywords`);
      }
      yield eat(chrs(value));
    },

    *String() {
      let qr;
      qr = yield eatMatch(tok('LeftPunctuator', `'`, 'String:Single'));
      qr = qr || (yield eat(tok('LeftPunctuator', `"`, 'String:Double')));

      while ((yield eatMatch(tok`Literal`)) || (yield eatMatch(tok`EscapeSequence`)));

      yield eat(tok('RightPunctuator', qr[0].value, sym.parent));
    },

    *Literal({ state: { lexicalContext, result } }) {
      if (lexicalContext === 'String:Single') {
        yield eat(/[^\\']+/y);
      } else if (lexicalContext === 'String:Double') {
        yield eat(/[^\\"]+/y);
      } else if (lexicalContext === 'Bare') {
        const lastType = result?.type;
        const isFirst = !lastType || lastType === 'EscapeCode' || lastType === 'Literal';
        if (isFirst) {
          yield eat(/[$_\w][$_\w\d]*/y);
        } else {
          yield eat(/[$_\w\d]+/y);
        }
      } else if (lexicalContext === 'Comment:Block') {
        yield eat(/([^*]*(\*[^\/])*)+/y);
      } else if (lexicalContext === 'Comment:Line') {
        yield eat(/./y);
      } else {
        throw new Error(`{lexicalContext: ${lexicalContext}} does not allow literals`);
      }
    },

    *Identifier() {
      while ((yield eatMatch(tok`Literal`)) || (yield eatMatch(tok`EscapeSequence`))) {}
    },

    *EscapeSequence({ state: { lexicalContext } }) {
      if (!(lexicalContext === 'Bare' || lexicalContext.startsWith('String'))) {
        throw new Error(`{lexicalContext: ${lexicalContext}} does not define an escape sequence`);
      }

      yield guard(chrs('\\'));

      yield eat(tok`Escape`);
      yield eat(tok`EscapeCode`);
    },

    *Escape({ state: { lexicalContext } }) {
      if (!(lexicalContext === 'Bare' || lexicalContext.startsWith('String'))) {
        throw new Error(`{lexicalContext: ${lexicalContext}} does not define an escape`);
      }

      yield eat(chrs('\\'));
    },

    *EscapeCode({ state: { lexicalContext } }) {
      if (!(lexicalContext.startsWith('String') || lexicalContext === 'Bare')) {
        throw new Error(`{lexicalContext: ${lexicalContext}} does not define any escape codes`);
      }

      if (yield eatMatch(/u{\d{1,6}}/y)) {
        // break
      } else if (yield eatMatch(/u\d\d\d\d/y)) {
        // break
      } else if (lexicalContext !== 'Bare') {
        if (yield eatMatch(/x\d\d/y)) {
          // break
        } else if (yield eatMatch(chrs(str(escapables.keys())))) {
          // break
        } else {
          yield fail();
        }
      } else {
        yield fail();
      }
    },
  }),

  aliases: objectEntries({
    Token: [
      'Whitespace',
      'Keyword',
      'Punctuator',
      'LeftPunctuator',
      'RightPunctuator',
      'CommentStart',
      'CommentEnd',
      'Literal',
      'Escape',
      'EscapeCode',
    ],
    Comment: ['BlockComment', 'LineComment'],
    Trivia: ['Comment', 'Whitespace'],
  }),

  enhancers: [tokenBoundsEnhancer],
};

export default grammar;
