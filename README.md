# cst-traverse

This library provides tools for working with javascript expressed as a Concrete Syntax Tree, or CST. For our purposes a CST is a particular subtype of AST in which all text is represented in the tree, including non-semantic text like whitespace and comments. The primary goal of a CST is to ensure that `print(parse(text)) === text`, in other words to preserve formatting when the intent is to modify and reprint a program rather than just executing it.

This project is a designed as a successor to the [cst](https://github.com/cst/cst) library which is more functional, more loosely coupled, more tolerant of mangled tokens, and more memory efficient. The intent is to replicate and possibly eventually replace the undocumented [@babel/traverse](https://babeljs.io/docs/en/babel-traverse) while eliminating the need for [recast](https://github.com/benjamn/recast) by instead integrating directly with [prettier](https://github.com/prettier/prettier) to achieve perfect printing in a single pass.

