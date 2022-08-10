import { exec } from 'cst-tokens/commands';

const { isArray } = Array;

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

export const StringText = (value) => {
  const defaultValue = value;
  return {
    type: 'StringText',
    value,
    mergeable: true,
    hoistable: false,
    build(value) {
      return { type: 'StringText', value: value || defaultValue };
    },
    *matchChrs() {
      const { value } = this;
      let result = '';

      // prettier-ignore
      for (const chr of value) {
        let code = chr.charCodeAt(0);
        let chrs = null;
        if (
          (chrs = yield* exec(chr))
        ) {
        } else if (
          escapables.has(chr) && (chrs = yield* exec(escapables.get(chr)))
        ) {
        } else if (
          code < 0xff &&
          (chrs = yield* exec(new RegExp(`\\\\x${code.toString(16).padStart(2, '0')}`)))
        ) {
        } else if (
          (chrs = yield* exec(new RegExp(`\\\\u${code.toString(16).padStart(4, '0')}`)))
        ) {
        }
        // \u{00000f}

        if (chrs) {
          result += chrs;
        } else {
          return null;
        }
      }

      return result;
    },
    toString() {
      return `StringText\`${value}\``;
    },
  };
};

export const Whitespace = (value = ' ') => {
  const defaultValue = value;
  return {
    type: 'Whitespace',
    value,
    mergeable: true,
    hoistable: true,
    build(value) {
      return { type: 'Whitespace', value: value || defaultValue };
    },
    *matchChrs() {
      return yield* exec(/\s+/);
    },
    toString() {
      return `Whitespace\`${value}\``;
    },
  };
};

export const Punctuator = (value) => {
  return {
    type: 'Punctuator',
    value,
    mergeable: false,
    hoistable: false,
    build() {
      return { type: 'Punctuator', value };
    },
    *matchChrs() {
      return yield* exec(this.value);
    },
    toString() {
      return `Punctuator\`${value}\``;
    },
  };
};

export const Keyword = (value) => {
  return {
    type: 'Keyword',
    value,
    mergeable: false,
    hoistable: false,
    build() {
      return { type: 'Keyword', value };
    },
    *matchChrs() {
      return yield* exec(this.value);
    },
    toString() {
      return `Keyword\`${value}\``;
    },
  };
};

export const Identifier = (value) => {
  const expected = { type: 'Identifier', value };
  return {
    type: 'Identifier',
    value,
    mergeable: false,
    hoistable: false,
    build(value) {
      return { type: 'Identifier', value: value || expected.value };
    },
    *matchChrs() {
      return yield* exec(this.value);
    },
    toString() {
      return `Identifier\`${value}\``;
    },
  };
};

const ws = Whitespace();

const stripArray = (value) => (isArray(value) ? value[0] : value);

// Shorthand names for more concise grammar definitions
// stripArray ensures that both ID`value` and ID(value) are valid
export const WS = (value = '') => Whitespace(stripArray(value));
export const PN = (value) => Punctuator(stripArray(value));
export const KW = (value) => Keyword(stripArray(value));
export const ID = (value) => Identifier(stripArray(value));
export const _ = ws;
