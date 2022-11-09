# cst-tokens

[![Gitter](https://badges.gitter.im/cst-tokens/community.svg)](https://gitter.im/cst-tokens/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

A CST, or Concrete Syntax Tree, is a way of representing a computer program that captures its source text and semantic structure simultaneously. This ability is crucial in creating smarter and more powerful tools for understanding and editing code. The goal of `cst-tokens` is to foster the growth of a new generation of code-editing technology that fully exploits the benefits of such a unified structure.

`cst-tokens` is named for the way it defines CSTs. Its CSTs are ASTs where each node has a `node.cstTokens` array of `{type, value}` tokens. The special `type` `'Reference'` means that `node[value]` is a nested CST. The sturcture is easily represented as JSON.

`cst-tokens` functions primarily as a validator of CSTs. Its goal is to help other tools agree on what valid CSTs are. `cst-tokens` is written in JavaScript and is intended to support tools written in JavaScript. It is, however, language agnostic. To do anything other than print a CST you'll need a grammar. A grammar defines (for every possible AST node) what concrete syntax elements are allowed or required.

`cst-tokens` is compliant with the [semver specification](https://semver.org/).

## Why is this important?

If you had 1 second to look at some text, could you tell me if the text you saw was code or not? Probably. What if you only had 0.1 seconds? You'd probably look for evidence of common code features like nested indentation, highly variable line lengths, and the presence of braces and special characters. Code need have none of these things. We use them because they can help us understand the code more easily at a glance. Indentation helps us see nesting. Braces surround lists. We make keywords bright colors to cue us into their role in the grammar.

This is only how a person sees the program though. The first step towards running any code is to parse it. That's because while humans deal well with ambiguity -- we rapidly learn the reasons a single symbol may mean different things in different places -- computers choke on it. So for every kind of operation the language can perform, the syntax we see, say `fn()`, is parsed into an unambiguous name like `CallExpression`. Named nodes are then composed into a tree -- the **Abstract Syntax Tree** or **AST**. This representation of a program is ideal for analyzing and executing the logic contained in it, but it contains none of the structure that you could recognize at a glance. The AST allows us to do novel things like write programs that create programs, or even write programs that alter other programs. The desire to be able to do these things has led to the need for standardized names, since the alternative would be rebuilding all tools for every new parser.

The standardization of ASTs has created huge value for the digital world, but the one place it hasn't changed much at all is the way we edit code. It can't. To make the AST we threw away all the textual symbols that humans use to read programs: the blank space, the braces, the comments. To experience fantastic innovation and growth as code-transforming tools have, code editing tools need a useful, standard way of incorporating spaces, braces, and comments into an Abstract Syntax Tree, thus turning it into a **Conrete Syntax Tree** or **CST**. While there are many existing programs that work with concrete syntax, none have yet proved useful or standard enough to seed a new generation of code editors.

## A vision of the future

It is hard to overstate the potential inherent in next-gen editors! There is an immense amount of code in the world, and an immense amount of technical debt. We've created so many code messes that the major obstacle to cleaning them all up is that we simply can't code efficiently or fast enough. Let's say I write a library that exports a function `baz`, and 100 different projects call `baz()`. I then discover that `baz` would be easier to use if it were two functions called `bar` and `snoz` such that `bar(snoz(x)) == baz(x)`. I make this change, and my library is better now -- it's potentially more useful to more people, but also I've alienated everyone who was used to the old way of doing things. They use 1000 libraries and there's just too many changes like this for it to be practical to keep pace with the development of all of them!

Let's imagine some scenarios where new tools could help with the problems:

Imagine I, the author of the `baz` package, having made the `bar`/`snoz` change, share with you a script that automatically edits your code from the old `bar(x)` into the new `bar(snoz(x))`. I call this script a codemod. You apply the codemod to your repo and my code is now automatically upgraded to the newer more powerful `bar(snoz())` syntax.

Now imagine that instead of applying the codemod in a local environment, you send it straight to CI. CI computes (and stores) specific changes that executing the codemod would cause. It allows the reviewer to meaningfully review both the program generating the changes, and the changes themselves. What is merged is always the changes that have been reviewed, never purely the result of running the transform again, however running the transform again may be used to automatically resolve conflicts by presenting only new changes as being necessary for re-review!

Imagine that creating such a codemod was so trivial that anyone could do it, because your code editor always thought of your changes as codemods. The kinds of codemods that could be recorded and shared among the users of such a system would be as varied as people are imaginative.

## Architecture

Architecture docs are out of date. New ones coming soon.

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
import { updateTokens, print, reprint } from 'cst-tokens';
import jsGrammar from '@cst-tokens/js-grammar-estree';

const sourceText = `import     def,{   foo  as/**/foo} from  'bar';`;

const cst = parseModule(sourceText);

// Use source text and locations to recursively tokenize
updateTokens(cst, jsGrammar, { sourceText });

assert(print(cst, jsGrammar) === sourceText); // It is! Yay!

// Transform, being careful to maintain the validity of the structure
// cst-tokens will help you make valid edits
transform(cst);

console.log(reprint(cst, jsGrammar));
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
