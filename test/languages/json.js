import { i } from '@bablr/boot';
import isString from 'iter-tools-es/methods/is-string';
import { buildCovers } from '@bablr/helpers/grammar';
import { buildString } from '../../lib/transforms.generated.js';

const node = Symbol.for('@bablr/node');

export const dependencies = {};

export const name = 'JSON';

export const grammar = class JSONGrammar {
  constructor() {
    this.covers = buildCovers({
      [node]: [
        'Expression',
        'Property',
        'Element',
        'StringContent',
        'Punctuator',
        'Keyword',
        'Digit',
      ],
      Expression: ['Array', 'Object', 'String', 'Boolean', 'Number', 'Null'],
    });
  }

  *Match(matchers) {
    for (const { 0: matcher, 1: guard } of matchers) {
      const guard_ = isString(guard) ? buildString(guard) : guard;
      if (yield i`match(${guard_})`) {
        yield i`eat(${matcher})`;
        break;
      }
    }
  }

  *Expression() {
    yield i`eat(<Match> [
        [<Array> '[']
        [<Object> '{']
        [<String> '"']
        [<Number> /\d/]
        [<Null> 'null']
        [<Boolean> /true|false/]
      ])`;
  }

  // @CoveredBy('Expression')
  // @Node
  *Array() {
    yield i`eat(<| Punctuator '[' .open balanced=']' |>)`;
    let first = true;
    while ((first || (yield i`match(',')`)) && !(yield i`match(']')`)) {
      if (!first) {
        yield i`eat(<| Punctuator ',' .separators |>)`;
      }
      yield i`eat(<Element .elements>)`;
      first = false;
    }
    yield i`eat(<| Punctuator ']' .close balancer |>)`;
  }

  // @CoveredBy('Expression')
  // @Node
  *Object() {
    yield i`eat(<| Punctuator '{' .open balanced='}' |>)`;
    let first = true;
    while ((first || (yield i`match(',')`)) && !(yield i`match('}')`)) {
      if (!first) {
        yield i`eat(<| Punctuator ',' .separators |>)`;
      }
      yield i`eat(<Property .properties>)`;
      first = false;
    }
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
    yield i`eat(<| StringContent .content |>)`;
    yield i`eat(<| Punctuator '"' .close balancer |>)`;
  }

  // @Node
  *StringContent() {
    yield i`eat(/[^"\n]+/)`;
  }

  // @CoveredBy('Expression')
  // @Node
  *Number() {
    while (yield i`match(/\d/)`) {
      yield i`eat(<| Digit .digits |>)`;
    }
  }

  // @CoveredBy('Expression')
  // @Node
  *Boolean() {
    yield i`eat(<| Keyword /true|false/ .value |>)`;
  }

  // @CoveredBy('Expression')
  // @Node
  *Null() {
    yield i`eat(<| Keyword 'null' .value |>)`;
  }

  // @Node
  *Digit() {
    yield i`eat(/\d/)`;
  }

  // @Node
  *Keyword({ attrs, value }) {
    const value_ = isString(value) ? buildString(value) : value;
    yield i`eat(${value_})`;

    return { attrs };
  }

  // @Node
  *Punctuator({ attrs, value }) {
    const value_ = isString(value) ? buildString(value) : value;
    yield i`eat(${value_})`;

    return { attrs };
  }
};
