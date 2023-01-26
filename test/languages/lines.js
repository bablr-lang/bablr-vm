import { Grammar } from '@cst-tokens/grammar';
import {
  eat,
  match,
  eatMatch,
  pushLexicalContext,
  popLexicalContext,
  startPathOuterRange,
  endPathOuterRange,
  startPathInnerRange,
  endPathInnerRange,
} from '@cst-tokens/helpers/commands';
import { Bag } from '@cst-tokens/helpers/meta-productions';
import { ref, tok, captureInto } from '@cst-tokens/helpers/shorthand';
import { EOF } from '@cst-tokens/helpers/symbols';
import { map, objectEntries } from 'iter-tools-es';
import { LineBreak } from '@cst-tokens/helpers/descriptors';

export const tokenProductions = objectEntries({
  LineBreak,

  *Literal({ lexicalContext }) {
    if (lexicalContext === 'Bare') {
      yield eat(/[ \t]+/y);
    } else if (lexicalContext === 'Comment') {
      yield eat(/.+/y);
    }
  },

  *LineCommentStart() {
    yield eat('#');
  },
});

export const productions = objectEntries({
  *Program() {
    let p, lp;
    let first = true;
    while (!(yield match(EOF))) {
      p = yield startPathOuterRange();
      if (first) {
        yield eatMatch('Separator');
        yield startPathInnerRange();
      } else {
        yield eat('Separator');
      }
      if (lp) {
        yield endPathOuterRange(lp);
      }
      yield eatMatch(ref`lines:Line`);
      first = false;
      lp = p;
    }
    yield endPathInnerRange();
  },

  *Line() {
    yield eatMatch(tok`Trivia`);
    yield startPathInnerRange();
    yield eat(captureInto('value', tok`Literal`));
    yield endPathInnerRange();
  },

  *Separator() {
    yield* Bag(tok`LineBreak`, 'CommentLine');
  },

  *CommentLine() {
    if (yield eatMatch(tok`Trivia`, tok`LineCommentStart`)) {
      pushLexicalContext('Comment');
      yield eat(tok`Literal`);
      popLexicalContext('Comment');
    }
  },
});

export default {
  grammars: {
    token: new Grammar({
      productions: tokenProductions,
    }),

    syntax: new Grammar({
      aliases: objectEntries({
        Node: map((kv) => kv[0], productions),
      }),

      productions,
    }),
  },
};
