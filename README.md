# cst-tokens

[![Gitter](https://badges.gitter.im/cst-tokens/community.svg)](https://gitter.im/cst-tokens/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

`cst-tokens` provides tools for working with Concrete Syntax Trees, or CSTs. For our purposes a CST is a particular subtype of AST in which all text is represented in the tree, **including non-semantic text like whitespace and comments**. The primary goal of a CST is to ensure that `print(parse(text)) === text`, in other words to preserve formatting when the intent is to modify and reprint a program rather than just executing it.

`cst-tokens` is language and parser agnostic. It does not rely on any concrete syntax information embedded in ASTs you give it, instead it rebuilds concrete syntax from scratch by using the AST as a pattern to be matched against source text. This approach allows `cst-tokens` to guarantee consistency between abstract and concrete syntax, primarily by treating abstract syntax as the source of truth. This ensures that the results are completely consistent across parsers, and can even provide considerable consistency between languages.

`cst-tokens` is implemented in plain Javascript to ensure that the full community that benefits from the code can participate in its ongoing maintenance.

`cst-tokens` is compliant with [semver](https://semver.org/). It is currently in the `0.x` (initial development) phase, and so may introduce breaking changes in any release. A stable, documented `1.0.0` is the project's top priority.

## Purpose

`cst-tokens` has two main purposes:

- It contains core functionality that can be leveraged by tools written in javascript which need to query or update concrete syntax. Such tools include linters like [eslint](https://github.com/eslint/eslint) and formatters like [prettier](https://github.com/prettier/prettier).
- It makes it easy for any user to write arbitrary code transforms that can be applied by any tool which groks the `node.cstTokens` structure, and in this way supports the development of an organic ecosystem of such transforms, also known as codemods.

## Architecture

See [ARCHITECTURE.md](https://github.com/conartist6/cst-tokens/blob/trunk/ARCHITECTURE.md).

## Contributing

If you want to ask questions, please use [gitter](https://gitter.im/cst-tokens/community). (I'll get an email and respond.)  
If you want to make a proposal, please use [discussions](https://github.com/conartist6/cst-tokens/discussions).  
If you want to see what work is prioritized, see [issues](https://github.com/conartist6/cst-tokens/issues).  
If you have a private inquiry, send me an [email](mailto:conartist6@gmail.com).  
Thanks for helping keep the project organized!

This project uses the [debug](https://www.npmjs.com/package/debug) package. To debug the code, set `DEBUG=cst-tokens` in your environment. This will provide highly useful stack traces for debugging the grammar which, due to language limiations, are an all-or-nothing affair. The only possible place to generate such stack traces is before we know that there is an error!

## Will cst-tokens support my language?

`cst-tokens` doesn't support languages per se: its grammars provide support for the different AST structures that different parsers output. To use `cst-tokens` with a particular language you'll need a matched parser/grammar combination. Grammars are relatively easy (but not completely trivial) to create, and can be made for any AST structure which satisfies the following conditions:

- The AST is tree structured: it contains no cycles
- The AST is composed of node objects (each with a `node.type`) and arrays
- Arrays are not nested, and their contents are always nodes
- Arrays contain nodes in their source order

## Usage

```js
import { parseModule } from 'meriyah';
import { updateTokens, print } from 'cst-tokens';
import jsGrammar from '@cst-tokens/js-grammar-estree';

const sourceText = `import     def,{   foo  as/**/foo} from  'bar';`;

const ast = parseModule(sourceText);

// Use source text and locations to recursively tokenize
updateTokens(ast, jsGrammar, { sourceText });

assert(print(ast, jsGrammar) === sourceText); // It is! Yay!

// Modify the AST however you like here.
transform(ast);

// print the AST saving as much of the original formatting as possible.
console.log(print(ast, jsGrammar));
```

## The CST

Here's what the CST from the above example looks like:

<!--prettier-ignore-->
```json
{
  "type": "Program",
  "sourceType": "module",
  "body": [
    {
      "type": "ImportDeclaration",
      "specifiers": [
        {
          "type": "ImportDefaultSpecifier",
          "local": {
            "type": "Identifier",
            "name": "def",
            "cstTokens": [
              { "type": "Identifier", "value": "def" }
            ]
          },
          "cstTokens": [
            { "type": "Reference", "value": "local" }
          ]
        },
        {
          "type": "ImportSpecifier",
          "local": {
            "type": "Identifier",
            "name": "foo",
            "cstTokens": [
              { "type": "Identifier", "value": "foo" }
            ]
          },
          "imported": {
            "type": "Identifier",
            "name": "foo",
            "cstTokens": [
              { "type": "Identifier", "value": "foo" }
            ]
          },
          "cstTokens": [
            { "type": "Reference", "value": "imported" },
            { "type": "Whitespace", "value": "  " },
            { "type": "Keyword", "value": "as" },
            { "type": "CommentStart", "value": "/*" },
            { "type": "CommentEnd", "value": "*/" },
            { "type": "Reference", "value": "local" }
          ]
        }
      ],
      "source": {
        "type": "Literal",
        "value": "bar",
        "cstTokens": [
          { "type": "StringStart", "value": "'" },
          { "type": "String", "value": "bar" },
          { "type": "StringEnd", "value": "'" }
        ]
      },
      "cstTokens": [
        { "type": "Keyword", "value": "import" },
        { "type": "Whitespace", "value": "     " },
        { "type": "Reference", "value": "specifiers" },
        { "type": "Punctuator", "value": "," },
        { "type": "LeftPunctuator", "value": "{" },
        { "type": "Whitespace", "value": "   " },
        { "type": "Reference", "value": "specifiers" },
        { "type": "RightPunctuator", "value": "}" },
        { "type": "Whitespace", "value": " " },
        { "type": "Keyword", "value": "from" },
        { "type": "Whitespace", "value": "  " },
        { "type": "Reference", "value": "source" },
        { "type": "Punctuator", "value": ";" }
      ]
    }
  ],
  "cstTokens": [
    { "type": "Reference", "value": "body" }
  ]
}
```
