## Architecture

`cst-tokens` helps define and work with token streams expressed as iterables of ESTree token objects like `{type: 'keyword', value: 'if'}`. We allow each `node` in the AST to store a `node.tokens` array containing its own syntactic elements (but not those of its children). In place of any single child node we use a reference token as a placeholder. This is a new type of token like `{type: 'Reference', value: 'property'}` whose `value` is used to look up the relevant child, either with `node[ref.value]` or with `node[ref.value][idx++]`.

Tokens are represented internally as class instances to give us a place to define token-type-specific logic. Instances of token classese are usually constructed using the shorthand `` KW`value` `` which is equivalent to `new Keyword('value')`. Here you can see the core building and matching functionality the `Keyword` class defines:

<!-- prettier-ignore -->
```js
class Keyword {
  constructor(value) {
    this.value = value;
  }

  get type() { return 'Keyword' }

  build(value) {
    return { type: 'Keyword', value: value || this.value };
  }

  matchToken(token) {
    const { type, value } = token;
    return type === 'Keyword' && value === this.value;
  }

  matchString(str) { /* ... */ }
}
```

Tokens are combined with source streams (abbreviated `s`) in order to ensure that optional tokens from source are present in the output and that no required tokens are missing. Sources emit their original tokens so long as they are valid, but when the original tokens are no longer valid for the current AST they fall back to generating tokens purely from the AST. Thus the resulting token stream is always valid for the AST.

In this simple example you can see the basic parts of the mechanism working together to generate tokens for an `ImportSpecifier` node:

<!-- prettier-ignore -->
```js
function* generateImportSpecifierNodeTokens(node) {
  const { local, imported } = node;

  // The source stream builds tokens from node, or emits tokens present in node.tokens or originalText
  // sourceFor chooses the most appropriate strategy for each node
  const s = sourceFor(node);

  // If a whitespace token is in the source stream, consume it and emit it
  yield* s.allow(_);

  // If a ref`imported` token is not present in s, yield one and fallback
  yield* s.ensure(ref`imported`);

  // The AST is the source of truth. We always ensure any tokens that are necessary to build the AST we see. 
  if (local.name !== imported.name) {
    // Ensuring _ emits as much whitespace as was present and emits one space if none was present.
    // Passing multiple arguments to s.ensure is shorthand for sequential calls to s.ensure
    yield* s.ensure(_, ID`as`, _, ref`local`);
  }

  yield* s.allow(_);
}
```

And here's how we can use it:

```js
import { equal } from 'iter-tools';

// `foo as bar`, as in: `import {foo as bar} from './foo.js';`
const node = {
  type: 'ImportSpecifier',
  imported: { type: 'Identifier', name: 'foo' },
  local: { type: 'Identifier', name: 'bar' },
};

const genTokens = generateImportSpecifierNodeTokens;
// use iter-tools partial application to bind the comparison function
const tokensEqual = equal((a, b) => a.type === b.type && a.value === b.value);

tokensEqual(
  genTokens({ ...node, tokens: [ref`imported`, WS`\n  ` ID`as`, WS`\n`, ref`local`] }),
  // All the existing tokens were valid for the node and are reemitted:
  [ref`imported`, WS`\n  `, ID`as`, WS`\n`, ref`local`]
) // true

tokensEqual(
  genTokens({ ...node, tokens: [ref`imported`] }),
  // The lack of the ensured ID`as` token causes a fallback and some new tokens are built
  //  (these validate)   ->|  (these must be built)
  [ref`imported`, WS`\n  `, ID`as`, WS` `, ref`local`]
) // true
```
