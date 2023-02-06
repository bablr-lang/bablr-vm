# cst-tokens

[![Gitter](https://badges.gitter.im/cst-tokens/community.svg)](https://gitter.im/cst-tokens/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

`cst-tokens` is a set of functional Javascript APIs for grammar-directed linguistic literacy. Its overall goal is to help humans and computers read and write formalized syntaxes like programming languages. The project's overall goal is to normalize the use of Concrete Syntax Tree (CST) data structures by providing tools that make working with compliant structures easy.

## CSTs

The idea of a CST is to define a kind of meta-language -- a language in which formal elements of syntax and semantics are made fully explicit. If I were writing a textbook I might create and annotate a sentence to demonstrate English sentence structure:

```
Every adventure requires a first step.
[   subject   ] [ verb ] [  object  ].
```

Actually though there are additional layers of context here that are missing. That sentence is a quotation taken from Alice in Wonderland, so adding that context back in we get:

```
"Every adventure requires a first step." --Lewis Carroll, Alice in Wonderland
"[   subject   ] [ verb ] [  object  ]." --[   author  ], [       book       ]
"[           content                  ]" --[            attribution          ]
[                                  quotation                                 ]
```

In addition to understanding the structure of the sentence, I might be asked to describe the "tokens" in the sentence and their roles ("types"):

```
Every (determiner) adventure (noun) requires (verb) a (pronoun) first (adverb) step (noun) . (punctuation)
```

While it's impractical to store language in such detail, it's also unnecessary since the human brain can extract meaning from a sentence without needing formalizations. But it can be useful in some circumstances. I could invent new conventions like using `%` in place of `"`
