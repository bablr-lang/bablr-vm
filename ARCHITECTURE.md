## Architecture

I like to think of `cst-tokens` as an "un-parser". A parser takes source text and emits an AST for the program it represents. `cst-tokens` takes an AST and matches programs which generate that AST. This is not the same as printing, because there are often many different source texts which compile to the same AST. For example in javascript a string containing the beer emoji could be written either as `"🍺"` or as `'\u{1f37a}'`. Notice the quotes and unicode representation are different, but both snippets result in the same AST. Matching the text that generated a given AST allows us to create a CST -- an AST which also contains a representation of the concrete syntax that generated the abstract representation.

To un-parse an AST, cst-tokens requires a [grammar](#grammars) that describes how to match source text for a the types of nodes present in the AST. Most users will be able to use off-the-shelf grammar definitions, but significant care has been taken to ensure that it is easy to create new grammars.

### The engine

The `cst-tokens` package provides the top-level API, and contains the implementation of the matching engine. The engine is fundamentally a big state machine. Its basic function is to **take** tokens from a source (or sources), and **emit** them into per-node results. It does this by reading commands (including `take` and `emit` commands) as they are yielded from a grammar generator. These commands mutate state, so the engine uses a stack of states so that it is able to perform speculative matches and return to a previous state if they fail.

The `cst-tokens` engine is designed to fail fast, and uses aggressive validation strategies to ensure that it will be possible to add functionality to the grammar generator's command protocol as necessary without breaking backwards compatibility.

### Grammars

A complete grammar is an object of the form `{ [nodeType]: function*(node, context, state) { /* */ } }`. Each grammar describes how to match source text for the given node.

Here's a partial grammar which describes non-standard babel-style literals. We can write this without hesitation because the grammar doesn't demand that such a non-standard AST is used, it just understands what these nodes mean if it encounters them in an AST.

```js
import {
  Null,
  Boolean,
  StringStart,
  StringEnd,
  String,
} from '@cst-tokens/js-descriptors';
import { eat } from '@cst-tokens/helpers';

// The grammar:
export default {
  *NullLiteral() {
    // A NullLiteral matches a single Null descriptor
    // The Null descriptor matches the text "null"
    // The take command consumes the matched text from the source
    const tokens = yield { type: 'take', value: Null() };

    // Tokens won't be part of the final `cstTokens` array unless they are emitted
    yield { type: 'emit', value: tokens };
  },

  *BooleanLiteral(path) {
    const { value } = path.node;

    // eat is a helper that issues take and emit commands for us.
    // The Boolean descriptor matches 'true' if value is truthy and 'false' otherwise
    yield* eat(Boolean(value));
  },

  *StringLiteral(path) {
    const value = path.node;

    // The grammar is responsible for ensuring that opening and closing string quotes match
    // A default quotation mark `"` will be used in case no source text is present
    const [quotToken] = yield* eat(StringStart('"'));
    // The string `"` must be represented as `"\""` or `'"'`.
    // The String descriptor handles escapes for us given the value and quote type
    yield* eat(String(value, quotToken.value));
    // The closing quotation mark must match the opening one
    yield eat(StringEnd(quotToken.value));
  },
};
```

### Commands

Each `yield` from a grammar generator is a `command` of the form `{ type, value, error }`. Most commands also return a `result`, which can be collected as `result = yield command`.

Command types that manipulate the state stack are:

- `branch`: pushes a copy of the current state onto the state stack. Returns a state facade.
- `accept`: pops the top state from the stack and overwrites the parent state with it. Returns a state facade.
- `reject`: pops the top state from the stack and discards it. Returns a state facade.

Commands that update the top state are:

- `take`: advances (mutates) the position stored in `state.source` and returns a `token`
- `emit`: updates `state.result` (an [imm-stack](https://github.com/iter-tools/imm-stack) of emitted tokens). Implicit handling of results allows grammars to avoid the boilerplate of code like `result = result.append(yield { type: 'emit', value: token })`. This is desirable because for the vast majority of cases (but not all of them) the emitted tokens will be exactly the tokens taken from the input.

Any command arguments are stored in `command.value`.

`command.error` should only be non-null if `DEBUG=cst-tokens`, and allows you to see stack traces that indicate where in the grammar a given command originated. Most unfortunately language limitations mean that it is currently impossible to capture a stack trace for the grammar after it has issued an invalid command.

### Helpers

Helpers are designed to minimize the boilerplate involved in writing grammar generators, specifically around issuing commands and following the protocol. You can write a grammar generator without using any helpers, but it's not clear why you would want to. Helpers are usually of the form `result = yield* helper(...args)`. To avoid unnecessary semver churn, helpers are not part of the core `cst-tokens` package, and can instead be found in [@cst-tokens/helpers](https://github.com/js-cst-tokens/helpers).

### Descriptors

Descriptors are essentially per-token grammars. Descriptors can issue their own "subcommands" to the engine which mutate engine state as it matches inside a token of a particular type and value. Descriptors handle concerns like escaping.

Descriptors may or may not be integrated into a grammar. There exists an independent `@cst-tokens/js-descriptors` package because descriptors only deal with what is legal syntax in a language, not with how an AST is structured. That makes it possible to reuse descriptors to easily create different grammars when necessary to support parsers which produce differently-structured ASTs.
