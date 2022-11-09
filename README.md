# cst-tokens

[![Gitter](https://badges.gitter.im/cst-tokens/community.svg)](https://gitter.im/cst-tokens/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

A CST, or Concrete Syntax Tree, is a way of representing a computer program that captures its source text and semantic structure simultaneously. This ability is crucial in creating smarter and more powerful tools for understanding and editing code. The goal of `cst-tokens` is to foster the growth of a new generation of code-editing technology that fully exploits the benefits of such a unified structure.

`cst-tokens` is named for the way it defines CSTs. Its CSTs are ASTs where each node has a `node.cstTokens` array of `{type, value}` tokens. The special `type` `'Reference'` means that `node[value]` is a nested CST. The sturcture is easily represented as JSON.

`cst-tokens` functions primarily as a validator of CSTs. Its goal is to help other tools agree on what valid CSTs are. `cst-tokens` is written in JavaScript and is intended to support tools written in JavaScript. It is, however, language agnostic. To do anything other than print a CST you'll need a grammar. A grammar defines (for every possible AST node) what concrete syntax elements are allowed or required.

## Why this library?

`cst-tokens` has a novel approach to the problem space. Some highlights:

- Its grammars are written as generator functions, allowing them to be expressive, powerful, portable, and composable, all without the hassle of compilation.
- It is growth-oriented. It uses symbols and WeakMaps to create a clear and effective boundary between public and non-public state. It is compliant with the [semver](https://semver.org/) spec.
- It provides novel ways of dealing with whitespace and comments, hoisting them upwards in trees to make them maximally ambiguous. Exposing ambiguities plainly is the first step on the road to handling them sanely.
- It token types are designed to ensure that client code can make use of the basic structure of a language without even knowning what language it is. For example the `LeftPunctuator` and `RightPunctuator` token types allow code folding and structural code search to be built in a language-agnostic way.

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
