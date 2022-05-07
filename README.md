# cst-tokens

[![Gitter](https://badges.gitter.im/cst-tokens/community.svg)](https://gitter.im/cst-tokens/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

This library provides tools for working with javascript expressed as a Concrete Syntax Tree, or CST. For our purposes a CST is a particular subtype of AST in which all text is represented in the tree, including non-semantic text like whitespace and comments. The primary goal of a CST is to ensure that `print(parse(text)) === text`, in other words to preserve formatting when the intent is to modify and reprint a program rather than just executing it.

This project is inspired by the [cst](https://github.com/cst/cst) library, and is intended as a direct successor to [recast](https://github.com/benjamn/recast). Its long term goal is integration with [prettier](https://github.com/prettier/prettier) to achieve perfect printing of arbitrarily modified code in a single pass.

## Status

This project is a proof-of-concept. It works on a small subset of JS grammar, and expanding its grammar is not the highest priority until core architectural issues are resolved. For more reading, see [Issue #1 - I need help.](https://github.com/conartist6/cst-tokens/issues/1)

## Contributing

If you want to ask questions, please use [gitter](https://gitter.im/cst-tokens/community). (I'll get an email and respond.)  
If you want to make a proposal, please use [discussions](https://github.com/conartist6/cst-tokens/discussions).  
If you want to see what work is prioritized, see [issues](https://github.com/conartist6/cst-tokens/issues).  
If you have a private inquiry, send me an [email](mailto:conartist6@gmail.com).  
Thanks for helping keep the project organized!

## Usage

```js
import { parseModule } from 'meriyah';
import { rebuildAllTokens, print } from 'cst-tokens';

const sourceText = `import     def,{   foo  as/**/foo} from  'bar';\n`;

const ast = parseModule(sourceText, { ranges: true });

// Use source text and locations to recursively tokenize
rebuildAllTokens(ast, { sourceText });

// Modify the AST however you like here.

assert(print(ast) === sourceText); // It is! Yay!

console.log(JSON.stringify(ast, undefined, 2));
```

Which prints the following (edited for clarity):

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
            "tokens": [
              {
                "type": "Identifier",
                "value": "def"
              }
            ]
          },
          "tokens": [
            {
              "type": "Reference",
              "value": "local"
            }
          ]
        },
        {
          "type": "ImportSpecifier",
          "local": {
            "type": "Identifier",
            "name": "foo",
            "tokens": [
              {
                "type": "Identifier",
                "value": "foo"
              }
            ]
          },
          "imported": {
            "type": "Identifier",
            "name": "foo",
            "tokens": [
              {
                "type": "Identifier",
                "value": "foo"
              }
            ]
          },
          "tokens": [
            {
              "type": "Reference",
              "value": "imported"
            },
            {
              "type": "Whitespace",
              "value": "  "
            },
            {
              "type": "Identifier",
              "value": "as"
            },
            {
              "type": "Comment",
              "value": "/**/"
            },
            {
              "type": "Reference",
              "value": "local"
            }
          ]
        }
      ],
      "source": {
        "type": "Literal",
        "value": "bar",
        "tokens": []
      },
      "tokens": [
        {
          "type": "Keyword",
          "value": "import"
        },
        {
          "type": "Whitespace",
          "value": " "
        },
        {
          "type": "Reference",
          "value": "specifiers"
        },
        {
          "type": "Punctuator",
          "value": ","
        },
        {
          "type": "Punctuator",
          "value": "{"
        },
        {
          "type": "Reference",
          "value": "specifiers"
        },
        {
          "type": "Punctuator",
          "value": "}"
        },
        {
          "type": "Keyword",
          "value": "from"
        },
        {
          "type": "Reference",
          "value": "source"
        }
      ]
    }
  ],
  "tokens": [
    {
      "type": "Reference",
      "value": "body"
    },
    {
      "type": "Whitespace",
      "value": "\n"
    }
  ]
}
```
