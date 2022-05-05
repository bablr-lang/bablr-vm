# cst-traverse

This library provides tools for working with javascript expressed as a Concrete Syntax Tree, or CST. For our purposes a CST is a particular subtype of AST in which all text is represented in the tree, including non-semantic text like whitespace and comments. The primary goal of a CST is to ensure that `print(parse(text)) === text`, in other words to preserve formatting when the intent is to modify and reprint a program rather than just executing it.

This project is inspired by the [cst](https://github.com/cst/cst) library, and is intended as a direct successor to [recast](https://github.com/benjamn/recast). Its long term goal is integration with [prettier](https://github.com/prettier/prettier) to achieve perfect printing of arbitrarily modified code in a single pass.
