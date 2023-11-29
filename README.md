# bablr-vm

[![come chat on Discord](https://img.shields.io/discord/1151914613089251388)](https://discord.gg/NfMNyYN6cX)

This the home of the Javascript reference implemenation of the BABLR VM, formerly known as `cst-tokens`. It executes BABLR grammars written in Javascript to define parsers for any programming language.

## Explain Like I'm 5

Let's start with what we know for sure: `b` is a letter, and `3` is a number. Well, of course, except when `b` is a number, as it may be in the hexidecimal system where it is used to represent the value `11`. `3` can also be used to make a pictographic heart: `<3`. Programming languages are a collection of formal rules about exactly what certain characters mean when they appear in certain contexts, but so far there has been no system of notation to help undrstand how formal rules are applied. BABLR provides one, allowing our "gotcha" example to be expressed clearly as `<Number><Digit>'b'</></>`.

## Features

The VM is a kind of state machine known formally as as "pushdown automaton", and is intended to be sufficiently powerful to recognize the syntax and structure of any programming language. Rather than a formal schema definition, a language is defined through the provision of useful APIs for working with valid documents written in that language.

This API differs from that of most other production-grade parsers, which are most often parser generators. BABLR grammars are purely runtime Javascript, and so tend to be extremely lightweight compared to comparable compiled forms. All parsing and traversal is done in a streaming manner to the extent possible.

## Usage

The BABLR VM is unready for production usage, and will continue to be so until `v1.0.0` is released. For right now the more people try out this code and provide me feedback, the faster I will make progress towards production-readiness!

```js
import { parseCSTML } from '@bablr/vm';
import { i } from '@bablr/boot';

const digits = class {
  constructor() {
    this.covers = {
      [Symbol.for('@bablr/node')]: ['Number', 'Digit'],
    };
  }

  *Number() {
    while (yield i`eat(<| Digit .digits |>)`);
  }

  *Digit() {
    yield i`eat(/\d/)`;
  }
};

parseCSTML(digits, '42');

// <Number>
//   <Digit .digits>
//     '4'
//   </>
//   <Digit .digits>
//     '2'
//   </>
//  </>
```

## Prior Art

BABLR is actually portmanteau of [Babel](https://babeljs.io/), and [ANTLR](https://www.antlr.org/). It would be reasonable to describe this project as being a mixture of the ideas from those two, with a bit of help from [SrcML](https://www.srcml.org/), [Tree-sitter](https://tree-sitter.github.io/), and the fabulous [Redux](https://redux.js.org/).

It is also designed with the needs of [Prettier](https://prettier.io/) and [ESLint](https://eslint.org/) in mind.
