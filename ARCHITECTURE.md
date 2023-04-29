## Architecture

From its inception `cst-tokens` has been designed as a way to execute parsing algorithms on streams of input. I favor this technique for two main reasons:

- Defining operations over streams eliminates the concern of how the data is actually stored. Data can be stored in any format that can offer a string or byte iterator!
- Its perf characteristics are generally favorable. Even though this code will be much slower than any purpose-built parser, it should also still feel responsive as the streaming nature of it allows meaningful results to be reported before all the work is done. Here are a few more relevant facts about the perf implications of stream processing:
  - The paradigm works well in memory-constrained environments. It can execute queries on code without ever having to incur the costs of holding the complete binary contents of a file in memory or, even the cost of holding the complete parsed AST. A traditional parser needs to hold both in memory at the same time just to do a query!
  - Javascript memory allocators are (should be) well optimized to handle large volumes of short-lived objects with highly predictable types. I think this is reasonable to expect given that the design of the iterator specification strongly implies that it is good practice. The partciuarly techniques I've seen explained that make the pattern fast are [shapes and ICs](https://mathiasbynens.be/notes/shapes-ics) and [generational garbage collection](https://v8.dev/blog/trash-talk).
  - When transforming a stream it is much more reasonable from a perf standpoint to define a transformation as being composed of a many smaller transformations. This same pattern can be used with allocated objects, but each time another large long-lived copy of the data needs to be created.

### LR

The desire to operate on streams of input restricts us to the so-called [LR](https://en.wikipedia.org/wiki/LR_parser) parsing algorithms, which are parsers which never need to go backwards in their input. In general they work by having state that mutates as input is consumed. The LR parser family breaks down some more:

`cst-tokens` is a General LR (or G-LR) parser, meaning that it is able to handle ambiguous inputs. G-LR parsers handle this by allowing their state to be copied, which in `cst-tokens` looks like `nextState = state.branch()`. Then they can pursue speculative matching using the branched state. If the speculative match fails we just fall back to the old state.

`cst-tokens` is an LR(k) parser. An LR(1) parser is only be able to look at the current character of input, so the 'k' designates that `cst-tokens` allows for lookahead queries arbitrarily far ahead into the input.

In order to do lookahead and fallback, `cst-tokens` needs branchable streams. Streams are fundamentally stateful, so the hard part of doing lookahead on a stream is making sure the stream appears unchanged when you are done, even though the stream's state will definitely have changed. The facade we build around an input stream for this purpose is `Source`. It caches any values it consumes from the input, and allows the creation of arbitrarily many branches (or branches of branches), each of which behaves independently.
