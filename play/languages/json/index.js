import { parse as parseDocument } from '@humanwhocodes/momoa';

import { eat, List } from '@cst-tokens/helpers/grammar/node';
import { eat as eatChrs, NamedLiteral } from '@cst-tokens/helpers/grammar/token';
import { objectEntries } from '@cst-tokens/helpers/object';
import { tok, node } from '@cst-tokens/helpers/shorthand';
import { nodeBoundsEnhancer, tokenBoundsEnhancer } from '@cst-tokens/helpers/enhancers';
import { productions } from '@cst-tokens/helpers/productions';
import { parent } from '@cst-tokens/helpers/symbols';
import * as sym from '@cst-tokens/helpers/symbols';

const PN = (...args) => tok('Punctuator', String.raw(...args));

export const parse = (code) => {
  return parseDocument(code).body;
};

export default {
  grammars: {
    [sym.node]: {
      productions: productions({
        *Array() {
          yield eat(PN`[`);
          yield* List({ value: { separator: PN`,`, matchable: node`Element:elements` } });
          yield eat(PN`]`);
        },

        *Object() {
          yield eat(PN`{`);
          yield* List({ value: { separator: PN`,`, matchable: node`ObjectProperty:properties` } });
          yield eat(PN`}`);
        },

        *Member() {
          yield eat(node`String:type`, PN`:`, node`Expression:value`);
        },

        *Element() {
          yield eat(node`Expression:value`);
        },

        *String() {
          yield eat(tok('Punctuator', '"', 'string'));
          yield eat(tok`Literal`);
          yield eat(tok('Punctuator', '"', parent));
        },

        *Number() {
          yield eat(tok`Number:value`);
        },

        *Null() {
          yield eat(tok`Null`);
        },
      }),

      aliases: objectEntries({
        Expression: ['Array', 'Object', 'String', 'Number', 'Null'],
        Node: ['Expression', 'Member', 'Element'],
      }),

      enhancers: [nodeBoundsEnhancer],
    },

    [sym.token]: {
      productions: productions({
        Punctuator: NamedLiteral,

        *Literal({ state: { lexicalContext } }) {
          if (lexicalContext === 'string') {
            yield eatChrs(/[^"\n]+/y);
          } else {
            throw new Error();
        }
        },

        *Number() {
          yield eatChrs(/\d+/y);
        },

        *Null() {
          yield eatChrs('null');
        },
      }),

      aliases: objectEntries({
        Token: ['Punctuator', 'Literal', 'Number', 'Null'],
      }),

      enhancers: [tokenBoundsEnhancer],
    },
  },
};
