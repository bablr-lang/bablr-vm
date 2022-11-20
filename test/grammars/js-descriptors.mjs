import { eatMatchChrs as eatMatch } from '@cst-tokens/helpers/commands';
import { Literal } from '@cst-tokens/helpers/descriptors';

const escapables = new Map(
  Object.entries({
    '\b': '\\b',
    '\f': '\\f',
    '\n': '\\n',
    '\r': '\\r',
    '\t': '\\t',
    '\v': '\\v',
    '\0': '\\0',
  }),
);

export const Whitespace = () => Literal('Whitespace', /[ \t]+/);

export const StringStart = () => Literal('StringStart', "'");
export const StringEnd = () => Literal('StringEnd', "'");

export const String = (value) => {
  return {
    type: 'String',
    value,
    mergeable: true,
    *eatChrs() {
      const { value } = this;
      let result = '';

      for (const chr of value) {
        let code = chr.charCodeAt(0);
        let chrs = null;

        // prettier-ignore
        if ((chrs = yield* eatMatch(chr))) {
          // continue
        } else if (escapables.has(chr) && (chrs = yield* eatMatch(escapables.get(chr)))) {
          // continue
        } else if (code < 0xff && (chrs = yield* eatMatch(new RegExp(`\\\\x${code.toString(16).padStart(2, '0')}`)))) {
          // continue
        } else if (chrs = yield* eatMatch(new RegExp(`\\\\u${code.toString(16).padStart(4, '0')}`))) {
          // continue
        } else if (chrs = yield* eatMatch(new RegExp(`\\\\u\\{\\d{1,6}\\}`))) {
          // continue
        }

        if (chrs) {
          result += chrs;
        } else {
          return null;
        }
      }

      return result;
    },
  };
};

export const Identifier = (value) => {
  return {
    type: 'Identifier',
    value,
    mergeable: false,
    *eatChrs() {
      const { value } = this;
      let result = '';

      for (const chr of value) {
        let code = chr.charCodeAt(0);
        let chrs = null;
        if ((chrs = yield* eatMatch(chr))) {
          // continue
        } else if (
          (chrs = yield* eatMatch(new RegExp(`\\\\u${code.toString(16).padStart(4, '0')}`)))
        ) {
          // continue
        } else if ((chrs = yield* eatMatch(new RegExp(`\\\\u\\{\d{1,6}\\}`)))) {
          // continue
        }

        if (chrs) {
          result += chrs;
        } else {
          return null;
        }
      }

      return result;
    },
  };
};
