import { takeChrs as take } from '@cst-tokens/helpers';

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

export const StringStart = (value = "'") => {
  return {
    type: 'StringStart',
    value,
    mergeable: false,
    build() {
      return { type: 'StringStart', value };
    },
    *takeChrs() {
      return yield* take(this.value);
    },
  };
};

export const StringEnd = (value = "'") => {
  return {
    type: 'StringEnd',
    value,
    mergeable: false,
    build() {
      return { type: 'StringEnd', value };
    },
    *takeChrs() {
      return yield* take(this.value);
    },
  };
};

export const String = (value) => {
  const defaultValue = value;
  return {
    type: 'String',
    value,
    mergeable: true,
    build(value) {
      return { type: 'String', value: value || defaultValue };
    },
    *takeChrs() {
      const { value } = this;
      let result = '';

      for (const chr of value) {
        let code = chr.charCodeAt(0);
        let chrs = null;
        if ((chrs = yield* take(chr))) {
          // continue
        } else if (escapables.has(chr) && (chrs = yield* take(escapables.get(chr)))) {
          // continue
        } else if (
          code < 0xff &&
          (chrs = yield* take(new RegExp(`\\\\x${code.toString(16).padStart(2, '0')}`)))
        ) {
          // continue
        } else if ((chrs = yield* take(new RegExp(`\\\\u${code.toString(16).padStart(4, '0')}`)))) {
          // continue
        } else if ((chrs = yield* take(new RegExp(`\\\\u\\{\d{1,6}\\}`)))) {
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

export const Whitespace = (value = ' ') => {
  const defaultValue = value;
  return {
    type: 'Whitespace',
    value,
    mergeable: true,
    build(value) {
      return { type: 'Whitespace', value: value || defaultValue };
    },
    *takeChrs() {
      return yield* take(/\s+/);
    },
  };
};

export const Punctuator = (value) => {
  return {
    type: 'Punctuator',
    value,
    mergeable: false,
    build() {
      return { type: 'Punctuator', value };
    },
    *takeChrs() {
      return yield* take(this.value);
    },
  };
};

export const LeftPunctuator = (value) => {
  return {
    type: 'LeftPunctuator',
    value,
    mergeable: false,
    build() {
      return { type: 'LeftPunctuator', value };
    },
    *takeChrs() {
      return yield* take(this.value);
    },
  };
};

export const RightPunctuator = (value) => {
  return {
    type: 'RightPunctuator',
    value,
    mergeable: false,
    build() {
      return { type: 'RightPunctuator', value };
    },
    *takeChrs() {
      return yield* take(this.value);
    },
  };
};

export const Keyword = (value) => {
  return {
    type: 'Keyword',
    value,
    mergeable: false,
    build() {
      return { type: 'Keyword', value };
    },
    *takeChrs() {
      return yield* take(this.value);
    },
  };
};

export const Identifier = (value) => {
  const expected = { type: 'Identifier', value };
  return {
    type: 'Identifier',
    value,
    mergeable: false,
    build(value) {
      return { type: 'Identifier', value: value || expected.value };
    },
    *takeChrs() {
      const { value } = this;
      let result = '';

      for (const chr of value) {
        let code = chr.charCodeAt(0);
        let chrs = null;
        if ((chrs = yield* take(chr))) {
          // continue
        } else if ((chrs = yield* take(new RegExp(`\\\\u${code.toString(16).padStart(4, '0')}`)))) {
          // continue
        } else if ((chrs = yield* take(new RegExp(`\\\\u\\{\d{1,6}\\}`)))) {
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

const ws = Whitespace();

const stripArray = (value) => (isArray(value) ? value[0] : value);

// Shorthand names for more concise grammar definitions
// stripArray ensures that both ID`value` and ID(value) are valid
export const PN = (value) => Punctuator(stripArray(value));
export const LPN = (value) => LeftPunctuator(stripArray(value));
export const RPN = (value) => RightPunctuator(stripArray(value));
export const KW = (value) => Keyword(stripArray(value));
export const _ = ws;
