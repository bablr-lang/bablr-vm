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
    yield i`eat(<List> {
        separator: <| Punctuator ',' .separators |>
        element: <Element .elements>
      })`;
    yield i`eat(<| Punctuator ']' .close balancer |>)`;
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
    yield i`eat(<| Punctuator '"' balanced='"' innerSpan='String' |>)`;
    yield i`eat(<StringContent .content>)`;
    yield i`eat(<| Punctuator '"' balancer |>)`;
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
    yield i`eat(${value})`;

    return { attrs };
  }
};
