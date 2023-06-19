## Architecture

The main organizing principle of cst-tokens is LR parsing. A program's `source` is represented as a stream, and that stream is consumed incrementally from left to right. As execution happens `source` is consumed and the engine's mutable `state` evolves.

In this case the "engine" is a virtual machine whose fundamental business is processing instructions. For example an instruction to the machine might be written:

```js
returnValue = yield {
  type: sym.match
  value: {
    effects: { success: sym.eat, failure: sym.none },
    matchable: {
      type: sym.character,
      value: '+'
    }
  }
}
```

The state of `state` after such a match instruction depends on whether the current character in `source` is `+`, which will determine whether `effects.success` or `effects.failure` will be applied. In the example `success` advances `source` and returns the consumed text, while failure leaves `state` and `source` untouched.

### Time ordering

While you might think about a conventional parser as moving around in space (for example by changing the index into a source buffer) the main dimension to think about in a streaming parser is time. Time has challenges. You can move backwards in space, but not so for time! Parsing ambgiuous languages requires you to be able to "go back and try something different" though, a problem `cst-tokens` solves by making clones of its `state` objects that serve as checkpoints that it can safely return to.
