
import {match, eat, Any, List} from '@cst-tokens/helpers/grammar/node';
import {eat as eatChrs, NamedLiteral} from '@cst-tokens/helpers/grammar/token';
import { objectEntries } from '@cst-tokens/helpers/object';
import { tok, node, chrs } from '@cst-tokens/helpers/shorthand';
import { nodeBoundsEnhancer, tokenBoundsEnhancer } from '@cst-tokens/helpers/enhancers';
import { productions } from '@cst-tokens/helpers/productions';
import * as sym from '@cst-tokens/helpers/symbols';

// Welcome!
const PN = (...args) => tok('Punctuator', String.raw(...args));

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions/Cheatsheet

// https://astexplorer.net/#/gist/6734e9049df0bcd1d5f0fe94e43fa7d9/5c006504a74fa35f9be349672fa0a1a9ab838453

export default {
  grammars: {
    [sym.node]: {
      productions: productions({
        *CharacterClass() {
          yield eat(tok('Punctuator', `[`, 'CharacterClass')); // sets lexicalContext to CharacterClass
          while (!(yield match(chrs`]`))) {
            // yield eat(Any(node`Character:elements`, node`CharacterClassRange:elements`));
            yield eat(Any(node`Character:elements`))
          }
          yield eat(tok('Punctuator', `]`, sym.parent));
        },

        *RegExpLiteral(){
          yield eat(PN`/`);
          yield eat(node`Pattern:pattern`)
          yield eat(PN`/`);
        },

        *Character() {
          yield eat(tok`Literal`);
        },

        *Alternative(){
          yield eat(Any(node`Character:elements`, node`CharacterClass:elements`))
        },

        *Pattern(){
          yield eat(node`Alternative:alternatives`)
        }

        // *CharacterClassRange() {
        // implement me
        // },

      }),

      aliases: objectEntries({
        Node: ['RegExpLiteral', 'Character', 'Alternative', 'Pattern'],
      }),

      enhancers: [nodeBoundsEnhancer],
    },

    [sym.token]: {
      productions: productions({
        Punctuator: NamedLiteral,

        *Literal({ state: { lexicalContext } }) {
          if (lexicalContext === 'CharacterClass') {
            // `/` is a literal here
            yield eatChrs(/\w/y);

          } else if (lexicalContext === 'Base') {
            // `/` is definitely not a literal here
            yield eatChrs(/\w|[^/]/);

          } else {
            throw new Error();
          }
        },

        // *Literal() {
        //   yield eatChrs(/\w/y);
        //
        // },

        *EscapeSequence() {
          yield eat(tok`Escape`);
          yield eat(tok`EscapeCode`);
        },

        *Escape() {
          yield eat(chrs('\\'));
        },


        *EscapeCode({ state: { lexicalContext } }) {
          // implement escapes like \n and \u1234
          // To start with ignore \0, \1 etc because the rules of how those get parsed are INSANE:
          // https://hackernoon.com/the-madness-of-parsing-real-world-javascript-regexps-d9ee336df983
        },
      }),

      aliases: objectEntries({
        Token: ['Punctuator', 'Literal', 'Escape', 'EscapeCode'],
      }),

      enhancers: [tokenBoundsEnhancer],
    },
  },
};
