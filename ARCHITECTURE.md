## Architecture

`cst-tokens` helps define and work with token streams expressed as iterables of ESTree token objects like `{type: 'keyword', value: 'if'}`. We allow each `node` in the AST to store a `node.tokens` array containing its own syntactic elements (but not those of its children). In place of any single child node we use a reference token as a placeholder. This is a new type of token like `{type: 'Reference', value: 'property'}` whose `value` is used to look up the relevant child, either with `node[ref.value]` or with `node[ref.value][idx++]`. Tokens are represented internally as class instances to give us a place to define token-type-specific logic.

The core of `cst-tokens` is the token generator: `function* generateTokens(node)`. Given a `node`, it emits tokens representing the concrete syntax for `node`. The function's primary imperatives are:

- To ensure that the tokens stream is always valid and consists of necessary to print or parse `node` are always emitted.
- To reemit optional tokens like whitepace and comments where were originally present.

To reemit optional tokens there needs to be some source to tell us which optional tokens were present in the intput. There are three sources defined, and `generateTokens` will pick the best one on a per-node basis.

- The "none" source uses the AST node to emit only required tokens (the ones we `ensure`d). It is the least preferable.
- The "original text" source uses `node.range` to look up a node's syntactic elements in the source text. It can only be used safely when the AST has not yet been modified at all, and is the second most prefereable source.
- The "node tokens" source, which uses the contents of the `node.tokens` array when present. This is the most prefereable source.

Here's what it all looks like put together. Notice that while the grammar defines what tokens are legal, it delegates all the actual token generation to the token source with `yield*`.

```js
const _ = WS``; // Comments complicate things in the real implementation
generateTokens(node, options) {
  const { Source = sourceFor(node, options) } = options;
  const s = new Source(node, options);

  yield* s.allow(_);

  switch(node.type) {
    case 'IfStatement': {
      yield* s.ensure(KW`if`);
      yield* s.allow(_);
      yield* s.ensure(PN`(`);
      yield* s.allow(_);
      yield* s.ensure(ref`test`);
      yield* s.allow(_);
      yield* s.ensure(PN`)`);
      yield* s.ensure(ref`consequent`);
      break;
    }
  }

  yield* s.allow(_);
}
```
