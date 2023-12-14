import { i } from '@bablr/boot';
import { buildCovers } from '@bablr/helpers/grammar';
import { triviaEnhancer } from '@bablr/helpers/trivia';

const node = Symbol.for('@bablr/node');

export const dependencies = {};

export const name = 'JSON';

export const grammar = triviaEnhancer(
  {
    triviaIsAllowed: (s) => s.span === 'Bare',
    eatMatchTrivia: i`eatMatch#(/(\s+|\/\*.*?\*\/|\/\/[^\n]+)+/)`,
  },
  class JSONGrammar {
    constructor() {
      this.covers = buildCovers({
        [node]: ['Expression', 'Property', 'StringContent', 'Punctuator', 'Keyword', 'Digit'],
        Expression: ['Array', 'Object', 'String', 'Boolean', 'Number', 'Null'],
      });
    }

    *Match(cases, _, ctx) {
      for (const case_ of ctx.unbox(cases)) {
        const { 0: matcher, 1: guard } = ctx.unbox(case_);
        if (yield i`match(${guard})`) {
          yield i`eat(${matcher})`;
          break;
        }
      }
    }

    *Expression() {
      yield i`eat(<Match> null [
        [<Array> '[']
        [<Object> '{']
        [<String> '"']
        [<Number span='Number'> /\d/]
        [<Null> 'null']
        [<Boolean> /true|false/]
      ])`;
    }

    // @CoveredBy('Expression')
    // @Node
    *Array() {
      yield i`eat(<| Punctuator '[' balanced=']' |> 'open')`;
      let first = true;
      while ((first || (yield i`match(',')`)) && !(yield i`match(']')`)) {
        if (!first) {
          yield i`eat(<| Punctuator ',' |> 'separators[]')`;
        }
        yield i`eat(<Element> 'elements[]')`;
        first = false;
      }
      if (first) {
        yield i`eat(null 'elements[]')`;
        yield i`eat(null 'separators[]')`;
      }
      yield i`eat(<| Punctuator ']' balancer |> 'close')`;
    }

    // @CoveredBy('Expression')
    // @Node
    *Object() {
      yield i`eat(<| Punctuator '{' balanced='}' |> 'open')`;
      let first = true;
      while ((first || (yield i`match(',')`)) && !(yield i`match('}')`)) {
        if (!first) {
          yield i`eat(<| Punctuator ',' |> 'separators[]')`;
        }
        yield i`eat(<Property> 'properties[]')`;
        first = false;
      }
      yield i`eat(<| Punctuator '}' balancer |> 'close')`;
    }

    // @Node
    *Property() {
      yield i`eat(<String> 'key')`;
      yield i`eat(<| Punctuator ':' |> 'mapOperator')`;
      yield i`eat(<Expression> 'value')`;
    }

    *Element() {
      yield i`eat(<Expression>)`;
    }

    // @CoveredBy('Expression')
    // @Node
    *String() {
      yield i`eat(<| Punctuator '"' balanced='"' lexicalSpan='String' |> 'open')`;
      yield i`eatMatch(<| StringContent |> 'content')`;
      yield i`eat(<| Punctuator '"' balancer |> 'close')`;
    }

    // @Node
    *StringContent() {
      let esc, lit;
      do {
        esc = yield i`eatMatch!(/\\(u(\{\d{1,6}\}|\d{4})|x[0-9a-fA-F]{2}|[\\nrt0"])/)`;
        lit = yield i`eatMatch(/[^\r\n\0\\"]+/)`;
      } while (esc || lit);
    }

    // @CoveredBy('Expression')
    // @Node
    *Number() {
      while (yield i`eatMatch(<| Digit |> 'digits[]')`);
    }

    // @CoveredBy('Expression')
    // @Node
    *Boolean() {
      yield i`eat(<| Keyword /true|false/ |> 'value')`;
    }

    // @CoveredBy('Expression')
    // @Node
    *Null() {
      yield i`eat(<| Keyword 'null' |> 'value')`;
    }

    // @Node
    *Digit() {
      yield i`eat(/\d/)`;
    }

    // @Node
    *Keyword(obj, _, ctx) {
      const { value, attrs } = ctx.unbox(obj);
      yield i`eat(${value})`;

      return { attrs };
    }

    // @Node
    *Punctuator(obj, _, ctx) {
      const { value, attrs } = ctx.unbox(obj);
      yield i`eat(${value})`;

      return { attrs };
    }
  },
);

const escapables = new Map(
  Object.entries({
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
    '\\': '\\',
    '/': '/',
  }),
);

export const cookEscape = (escape) => {
  if (!escape.startsWith('\\')) {
    throw new Error('string escape must start with \\');
  }

  const hexMatch = /\\u([0-9a-f]{4})/iy.exec(escape);

  if (hexMatch) {
    return String.fromCodePoint(parseInt(hexMatch[1], 16));
  }

  const litPattern = /\\([\\/bfnrt"])/y;
  const litMatch = litPattern.exec(escape);

  if (litMatch) {
    return escapables.get(litMatch[1]);
  }

  throw new Error('unable to cook string escape');
};
