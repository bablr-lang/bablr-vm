import { i } from '@bablr/boot';
import { buildCovers } from '@bablr/helpers/grammar';

const node = Symbol.for('@bablr/node');

export const dependencies = {};

export const name = 'JSON';

export const grammar = class JSONGrammar {
  constructor() {
    this.covers = buildCovers({
      [node]: ['Expression', 'Property', 'Element', 'StringContent', 'Punctuator'],
      Expression: ['Array', 'Object', 'String', 'Number', 'Null'],
    });
  }

  // @CoveredBy('Expression')
  // @Node
  *Array() {
    yield i`eat(<| Punctuator '[' .open balanced=']' |>)`;
    for (let _ of yield i`* eat(<ArrayElements .elements>)`) {
      if (yield i`eat(<| Punctuator ',' .separators |>)`) {
        continue;
      }
      break;
    }
    yield i`eat(<| Punctuator ']' .close balancer |>)`;
  }

  // @List
  *ArrayElements() {
    while (true) yield i`yield eat(<Element>)`;
  }

  // @CoveredBy('Expression')
  // @Node
  *Object() {
    yield i`eat(<| Punctuator '{' .open balanced='}' |>)`;
    yield i`eat(<List> {
        separator: <| Punctuator ',' .separators |>
        element: <Property .properties>
      })`;
    yield i`eat(<| Punctuator '}' .close balancer |>)`;
  }

  // @Node
  *Property() {
    yield i`eat(<All> [
        <String .type>
        <| Punctuator ':' .mapOperator |>
        <Expression .value>
      ])`;
  }

  // @Node
  *Element() {
    yield i`eat(<Expression .value>)`;
  }

  // @CoveredBy('Expression')
  // @Node
  *String() {
    yield i`eat(<| Punctuator '"' .open balanced='"' innerSpan='String' |>)`;
    yield i`eat(<StringContent .content>)`;
    yield i`eat(<| Punctuator '"' .close balancer |>)`;
  }

  // @Node
  *StringContent() {
    yield i`eat(/[^"\n]+/)`;
  }

  // @CoveredBy('Expression')
  // @Node
  *Number() {
    yield i`eat(/\d+/)`;
  }

  // @CoveredBy('Expression')
  // @Node
  *Null() {
    yield i`eat('null')`;
  }

  // @Node
  *Punctuator({ attrs, value }) {
    if (!value) throw new Error('Bad punctuator');

    yield i`eat(${value})`;

    return { attrs };
  }
};
