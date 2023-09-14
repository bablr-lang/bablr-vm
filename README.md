# bablr-vm

This the home of `bablr-vm` (formerly known as `cst-tokens`). This BABLR VM is implemented in Javascript, and executes BABLR grammars written using generator functions to define the syntax and semantics of a programming language. The VM is a kind of state machine known formally as as "pushdown automaton", and is intended to be sufficiently powerful to recognize the syntax and structure of any programming language. Rather than a formal schema definition, a language is defined through the provision of useful APIs for working with valid documents written in that language. The primary APIs provided are (loosely):

```js
parse = (bablrGrammar, src) => tags;
traverse = (bablrGrammar, tags) => tags;
traverseCSTML = (bablrGrammar, cstmlDocument) => tags;
```

This API differs from that of most other production-grade parsers, which are most often parser generators. BABLR grammars are purely runtime Javascript, and so tend to be extremely lightweight compared to comparable compiled forms. All parsing and traversal is done in a streaming manner to the extent possible.

`bablr-vm` follows the semver spec but it is currently `0.x`, so any version may introduce breaking changes to any API! `1.0.0` will be the first production-ready version.

## CSTML

CSTML is (more or less) a set of extensions to XML, designed primarily as a machine-readable format:

- It borrows JSON's conventions for escaping
  - e.g. it uses `'\''` instead of XML's `'&apos;'`
- Documents are stuctured trees of nodes
  - e.g. `<Expression path="expr"></Expression>`
    - **nodes _must_ have children!** (omitted above)
  - `</>` is allowed as shorter closing tag
- It has tokens which looks like this: `<| Type 'value' |>`
  - Token tags cannot have children
  - All document content must be present in token values
  - Built by a just-in-time scoped tokenizer
- It includes gap tags like `<[Expression]>`
  - Means "an `Expression` node is missing here"
  - Nodes that exist may still express their gap type
- Only whitespace is permitted outside of tags

Here is a CSTML document for the Javascript expression `2 + 2`:

```cstml
<!doctype cstml>
<cstml validate="https://url/to/grammar">
  <BinaryExpression [Expression]>
    <NumericLiteral [Expression] path="left">
      <| Digits "2" |>
    </>
    <| Trivia " " |>
    <| Punctuator "+" path="operator" |>
    <| Trivia " " |>
    <[Expression] path="right"/>
  </>
</cstml>
```

## BABLR Grammars

More documentation here soon. In the mean time check out [the BABLR grammar for CSTML](https://github.com/bablr-lang/language-cstml/blob/trunk/lib/node.grammar.js)!

## Prior Art

BABLR is actually portmanteau of [Babel](https://babeljs.io/), and [ANTLR](https://www.antlr.org/). It would be reasonable to describe this project as being a mixture of the ideas from those two, with a bit of help from [SrcML](https://www.srcml.org/), [Tree-sitter](https://tree-sitter.github.io/), and the fabulous [Redux](https://redux.js.org/).

It is also designed with the needs of [Prettier](https://prettier.io/) and [ESLint](https://eslint.org/) in mind.
