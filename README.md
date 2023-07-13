# cst-tokens

[![Gitter](https://badges.gitter.im/cst-tokens/community.svg)](https://gitter.im/cst-tokens/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

Welcome to the home of `cst-tokens`! This repository contains a family of related APIs for just-in-time language intelligence. External-facing APIs are provided for parsing, validating, and printing programs, and internal-facing APIs are provided for defining languages. All tools are capable of operating over input streams.

This repository contains code designed to be the heart of a decentralized ecosystem of tools for language literacy. Its goal is to provide common-sense capabilities and functionalities that can only emerge when a series of unaffiliated individuals are able to agree on the basic defitions for things.

In particular it hopes that the community of tool maintainers will agree that it makes sense to store programs in a particular kind of Concrete Syntax Tree (or **CST** for short). I hope to do this by showing that an ecosystem where tools can agree about the structure and validity CSTs is one which can be maintained with significant less overall effort due to the ability to share code that previously could not be shared.

The role of the `cst-tokens` package is to provide APIs that create abstractions between languages and tools that allow language-agnostic tools to be built. In this way the project intends to compete with [LSP](https://matklad.github.io/2022/04/25/why-lsp.html). It does however require (for now) that those tools be built in javascript. Tools powered by cst-tokens will be able to execute in any sufficiently modern javascript environment.

`cst-tokens` is independent. It does not have any "primary" supported language, nor any opinion whether one tree representation is more correct than another.

`cst-tokens` follows the semver spec but it is currently `0.x`, so any version may introduce breaking changes to any API! `1.0.0` is expected to be the first production-ready version.

## The CST

The most commonly discussed data structure for storing programs is the Abstract Syntax Tree or AST. The simple program `2 + 1.14` might be expressed with the following AST:

```jsonc
{
  "type": "BinaryExpression",
  "operator": "+",
  "left": {
    "type": "NumericLiteral",
    "value": 2
  },
  "right": {
    "type": "NumericLiteral",
    "value": 1.14
  }
}
```

The AST successfully captures the structure of a program, and that structure is used in a wide variety of tools. The difficulty with it is that you'll notice the spaces that were present in the input code (`2 + 1.14`) are not present in the AST. Neither is the precise representation of the float `1.14`! If we wanted to change the code to `2.14 + 1` the actual result would be `2.14+1`. What was lost is the concrete syntax of the program! A CST will contain all the information necessary to print an arbitrarily formatted program.

There are actually many data structures that are effectively CSTs, and many are already used widely. For example existing tools often use nodes with a `range` property containing `[startOffset, endOffset]` which are character offsets into the text the AST was parsed from. This arrangement is suitable for analysis but makes the concrete syntax of the program effectively read-only since the only way to alter it would be to replace the source string and repeat the entire task of parsing.

This problem has workarounds at present (e.g. eslint's `TokenStore`), but I intend to offer a solution. My solution is to insert into each node in the tree a property called `cstTokens` which contains the concrete syntactic elements belonging to that node. The `2.14 + 1` code is now stored in this tree:

```jsonc
{
  "type": "BinaryExpression",
  "cstTokens": [
    { "type": "Reference", "value": "left" },
    { "type": "Whitespace", "value": " " },
    { "type": "Punctuator", "value": "+" },
    { "type": "Whitespace", "value": " " },
    { "type": "Reference", "value": "right" }
  ],
  "operator": "+",
  "left": {
    "type": "NumericLiteral",
    "cstTokens": [
      { "type": "WholePart", "value": "2" },
      { "type": "Decimal", "value": "." },
      { "type": "DecimalPart", "value": "14" }
    ],
    "value": 2.14
  },
  "right": {
    "type": "NumericLiteral",
    "cstTokens": [{ "type": "WholePart", "value": "1" }],
    "value": 1
  }
}
```

This is a powerful representation with some great benefits, but also some serious drawbacks. Because the structure contains both the parsed and unparsed result, the work of the parser has been duplicated. We have more than one source of truth! The only way we can work around this is to redo the work of the parser. The code in this repository evolved entirely as a way to mitigate the costs of using this structure while maximizing the benefits.

## APIs

`cst-tokens` has two main APIs, the tooling API and the language API. It sits in the middle isolating tooling from language and visa versa.

### The tooling API

This is the side of the API that you will use if you are building tools. These APIs make no assumptions about language. Instead grammar-driven behavior is defined by a `language` argument.

```js
parse(language, sourceText);
*traverse(language, ast, sourceText);
*traverse(language, cst);
print(cst);
printTokens(cst);
```

### The language API

Formal documentation of the language API is forthcoming. **For the moment this API is unstable. The primary purpose of ongoing development is to stabilize this API.** Until the language API is stable you should look in `test/languages` to see how languages are currently defined, and you should not expect to write or use `cst-tokens` in a production environment.

A language is made up of two main grammars: a node grammar and a token grammar. Both kinds of grammar use the same basic mechanism: productions yield instructions to a state machine which tracks and encapsulates the evolving state. Let's look at an example of a node grammar for parsing import specifiers. This is a tiny grammar that parses inputs like `baz` and `foo as bar`:

<!--prettier-ignore-->
```js
import * as sym from '@cst-tokens/helpers/symbols';
import { tok, prod } from '@cst-tokens/helpers/shorthand';
import { eat, eatMatch, Grammar, All } from '@cst-tokens/helpers/grammar/node';

new Grammar({
  productions: {
    // This version of ImportSpecifier uses helpers to be concise:
    *ImportSpecifier() {
      yield eat(prod`Identifier:imported`);
      yield eatMatch(All(tok`Keyword:as`, prod`Identifier:local`));
    },

    // The helpers were being used to build up instructions
    // Here is what the same production looks like when the actions are written explicitly:
    *ImportSpecifier() {
      yield {
        type: sym.match,
        value: {
          effects: {
            success: sym.eat,
            failure: sym.fail,
          },
          matchable: {
            type: sym.node,
            production: { type: 'Identifier', property: 'imported' },
          },
        },
      };

      yield {
        type: sym.match,
        value: {
          effects: {
            success: sym.eat,
            failure: sym.none,
          },
          matchable: {
            type: sym.node,
            production: {
              type: sym.All,
              // this production does not map to a real AST node
              property: null,
              value: [
                {
                  type: sym.token,
                  production: { type: 'Keyword', value: 'as' },
                },
                {
                  type: sym.node,
                  production: { type: 'Identifier', property: 'local' },
                },
              ],
            },
          }
        }
      };
    },

    *Identifier() {
      yield eat(tok`Identifier`);
    },

    *[sym.All]({ matchables }) {
      for (const matchable of matchables) {
        yield eat(matchable);
      }
    },
  },
});
```
