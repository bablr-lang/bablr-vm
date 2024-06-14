# @bablr/vm

[![come chat on Discord](https://img.shields.io/discord/1151914613089251388)](https://discord.gg/NfMNyYN6cX)

Welcome to the home of the BABLR VM! The VM is at the core of the BABLR language definition ecosystem: its purpose is to provide a powerful, well-specified, universally-available execution environment for parsers.

By doing this BABLR makes it possible to create tools which integrate more deeply: it can create consensus around basic definitions that must be shared between well-integrated tools.

## Usage

Unless you are a power user, you should be using either [the BABLR API](https://github.com/bablr-lang/bablr) or [the BABLR CLI](https://github.com/bablr-lang/bablr-cli). If you are a power user (or otherwise have unique reuquirements) looking at how those packages are implemented will be a good place to start.

## Features

Parsers defined on the BABLR VM

- Execute in a streaming, LR fashion
  - Hold output as necessary for expression building
- Do just-in-time tokenization
- Support backtracking to resolve ambiguity
- Support arbitrary-size textual lookahead
- Offer high-level tools for defining trivia and precedence
- Produce results as a CSTML stream or an agAST tree
- Are backwards compatible with new VMs
- Are freely extensible
- Allow incremental reparsing (for responsivene editing)
- Can be easily debugged
- Get a comment attachment engine for free
- Support parsing templates (programs with holes in them)

Parsers defined on the BABLR VM do not have error recovery, and this is on purpose. In general error recovery is not science, it's guesswork necessary to keep the semantic model of the program from continually blinking into and out of existence as the user types syntax, passing through invalid syntactic states.

BABLR instead aims to make the most obvious solution the most pleasant: help users edit syntax without passing through invalid states
