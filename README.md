# cst-tokens

[![Gitter](https://badges.gitter.im/cst-tokens/community.svg)](https://gitter.im/cst-tokens/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

This library provides tools for working with Concrete Syntax Trees, or CSTs. For our purposes a CST is a particular subtype of AST in which all text is represented in the tree, **including non-semantic text like whitespace and comments**. The primary goal of a CST is to ensure that `print(parse(text)) === text`, in other words to preserve formatting when the intent is to modify and reprint a program rather than just executing it.

This project is inspired by the [cst](https://github.com/cst/cst) library, and is intended as a direct successor to [recast](https://github.com/benjamn/recast). Its long term goal is [integration](https://github.com/prettier/prettier/issues/12806) with [prettier](https://github.com/prettier/prettier) to achieve perfect printing of arbitrarily modified code.

## Contributing

If you want to ask questions, please use [gitter](https://gitter.im/cst-tokens/community). (I'll get an email and respond.)  
If you want to make a proposal, please use [discussions](https://github.com/conartist6/cst-tokens/discussions).  
If you want to see what work is prioritized, see [issues](https://github.com/conartist6/cst-tokens/issues).  
If you have a private inquiry, send me an [email](mailto:conartist6@gmail.com).  
Thanks for helping keep the project organized!

This project uses the [debug](https://www.npmjs.com/package/debug) package. To debug the code, set `DEBUG=cst-tokens;` in your environment. This will provide highly useful stack traces for debugging the grammar which, due to language limiations, are an all-or-nothing affair. The only possible place to generate such stack traces is before we know that there is an error!

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
          { "type": "Punctuator", "value": "'" },
          { "type": "Text", "value": "bar" },
          { "type": "Punctuator", "value": "'" }
        ]
      },
      "cstTokens": [
        { "type": "Keyword", "value": "import" },
        { "type": "Whitespace", "value": "     " },
        { "type": "Reference", "value": "specifiers" },
        { "type": "Punctuator", "value": "," },
        { "type": "Punctuator", "value": "{" },
        { "type": "Whitespace", "value": "   " },
        { "type": "Reference", "value": "specifiers" },
        { "type": "Punctuator", "value": "}" },
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
