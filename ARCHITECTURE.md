## Architecture

The primary focus of `cst-tokens` is presenting a solution to the `m * n` problem of tools and languages. In essence it needs to be possible to define a langauge without knowing exactly what kind of tool you are defining the language for, and it needs to be able to design language-agnostic tools. If either of these things is not true the complexity of langauge support explodes and the resulting systems will likely be too costly to maintain for the long term.

## Instructions

Writing a `cst-tokens` grammar is essentially like scripting a streaming parser for the language you wish to support. The role of the core is to make it as easy as possible to write or extend that streaming parser, and to provide a variety of useful operations that can be accomplished when the language is defined.

`cst-tokens` takes a (relatively) novel to avoiding dependencies between language definition and its core. Instead of writing something like `parser.eat('return')` (to match a `return` keyword) you instead write `yield { type: 'eat', value: 'return' };`, where the yielded object is the instruction. As you can see the dependency is broken, and a coroutine-based engine is able to process the action almost as if it had been a direct function call.

Since the example was a bit simplified, here is what a real, complete instruction looks like:

```js
{
  type: Symbol.for('cst-tokens/eatMatch');
  value: {
    type: Symbol.for('cst-tokens/terminal');
    value: {
      type: 'Keyword',
      value: 'return',
      property: null,
    }
  }
}
```

Note: In real code you would never write out the full instruction explicitly, but would construct it with helpers: `` eatMatch(term`Keyword:return`) ``

## Productions

To parse a real language you need to issue a series of instructions -- real language constructs are composed of multiple syntactic elements, and they are often nested. Let's take the example code `foo(bar)`. There are basically two kinds of nodes needed in this expression: `FunctionCall` and `Identifier`.

```js

```

```js
import { Grammar, eat, startToken, endToken } from '@cst-tokens/helpers/grammar';
import { objectEntries } from '@cst-tokens/helpers/object';
import { tok, chrs, prod } from '@cst-tokens/helpers/shorthand';
import { StartNode, EndNode } from '@cst-tokens/helpers/symbols';

const language = {
  // A language definition consists of a token grammar and a syntax grammar
  grammars: {
  // A token grammar defines how to parse characters into tokens
  // A token grammar can eat regex literals and string literals
    token: new Grammar({
      aliases: objectEntries({
        // For type safety you must declare the node types your language supports
        // Not all productions will be alias `Token`! Some will be metaproductions which reference other productions.
        Token: ['LeftPunctuator', 'RightPunctuator', 'Literal'],
      }),
      // Iterable<[type, production]>
      productions: objectEntries({
        *LeftPunctuator({ value }) {
          // startToken and endToken are usually factored away for terseness, but I included them here to show what really happens
          yield startToken();
          yield eat(chrs(value));
          yield endToken();
        },

        *RightPunctuator({ value }) {
          yield startToken();
          yield eat(chrs(value));
          yield endToken();
        },

        *Literal() {
          yield startToken();
          yield eat(/[$_\w][$_\w\d]*/y);
          // It is necessary to yield startToken/endToken in case the grammar needs to see its own result!
          // endToken returns the now-completed token.
          // While token is immutable, WeakMaps can be used to augment it with arbitrary metadata.
          const token = yield endToken();
        },
      }),
    }),
    // A syntax grammar defines how to parse tokens into trees
    syntax: new Grammar({
      aliases: objectEntries({
        Node: ['Identifier', 'FunctionCall'],
      }),

      productions: objectEntries({
        *Identifier() {
          yield eat(tok(StartNode));
          yield eat(tok`Identifier`);
          yield eat(tok(EndNode));
        },

        *FunctionCall() {
          yield eat(tok(StartNode));
          yield eat(prod`Literal:callee`);
          yield eat(tok`LeftPunctuator:(`);
          while (yield eat(tok`Identifier`)) {
            yield eatMatch(tok`Punctuator:,`)
          }
          yield eat(tok`RightPunctuator:)`);
          yield eat(tok(EndNode));
        },
      }),
    }),
  },
};

// We are now ready to use the language
const source = foo():
const parsed = { type: 'Call', callee: { type: 'Identifier', name: 'foo' }}
traverse(language, parsed, source);
```
