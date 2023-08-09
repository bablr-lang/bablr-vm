# bablr-vm

This the home of `bablr-vm` (formerly known as `cst-tokens`). This BABLR VM is implemented in Javascript, and executes BABLR grammars written using generator functions to define the syntax and semantics of a programming language. Rather than a formal definition, the "schema" is defined through the provision of useful APIs for working with valid documents. The primary APIs provided are (loosely):

```js
parse = (bablrGrammar, src) => tags;
traverse = (bablrGrammar, tags) => tags;
traverseCSTML = (bablrGrammar, cstmlDocument) => tags;
```

This API differs from that of most other production-grade parsers, which are most often parser generators. BABLR grammars are purely runtime Javascript, and so tend to be extremely lightweight compared to comparable compiled forms. All parsing and traversal is done in a streaming manner to the extent possible.

The BABLR VM is a kind of state machine known formally as as "pushdown automaton", and is intended to be sufficiently powerful to recognize the syntax and structure of any programming language.

`bablr-vm` follows the semver spec but it is currently `0.x`, so any version may introduce breaking changes to any API! `1.0.0` will be the first production-ready version.

## CSTML

CSTML is (more or less) a set of extensions to XML, designed primarily as a machine-readable format:

- Documents are stuctured trees of nodes
  - e.g. `<Expression path="expr"></Expression>`
    - **nodes _must_ have children!**
  - `</>` is allowed as shorthand for `</Expression>`
- It borrows JSON's conventions for escaping
  - e.g. it uses `'\''` instead of XML's `'&apos;'`
- It has tokens which looks like this: `<| Type 'value' |>`
  - Token tags cannot have children
  - All document content must be present in token values
  - Built by a just-in-time scoped tokenizer
- Only whitespace is permitted outside of tags
- It includes gap tags like `<[Expression]>`
  - Means "an `Expression` node is missing here"
  - Nodes that exist may still express their gap type

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

More documentation here soon. In the mean time check out [the BABLR grammar for CSTML](https://github.com/js-cst-tokens/cst-tokens/blob/trunk/lib/languages/cstml/index.js)!
