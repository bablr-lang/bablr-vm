import { takeChrs as takeChrs_, eat, eatMatch, ref } from '@cst-tokens/helpers';

const { isArray } = Array;

const Digit = (value) => {
  return {
    type: 'Digit',
    value,
    mergeable: false,
    build() {
      return { type: 'Digit', value };
    },
    *takeChrs() {
      return yield* takeChrs_(this.value);
    },
  };
};

const Punctuator = (value) => {
  return {
    type: 'Punctuator',
    value,
    mergeable: false,
    build() {
      return { type: 'Punctuator', value };
    },
    *takeChrs() {
      return yield* takeChrs_(this.value);
    },
  };
};

const LeftPunctuator = (value) => {
  return {
    type: 'LeftPunctuator',
    value,
    mergeable: false,
    build() {
      return { type: 'LeftPunctuator', value };
    },
    *takeChrs() {
      return yield* takeChrs_(this.value);
    },
  };
};

const RightPunctuator = (value) => {
  return {
    type: 'RightPunctuator',
    value,
    mergeable: false,
    build() {
      return { type: 'RightPunctuator', value };
    },
    *takeChrs() {
      return yield* takeChrs_(this.value);
    },
  };
};

const Whitespace = (value = ' ') => {
  const defaultValue = value;
  return {
    type: 'Whitespace',
    value,
    mergeable: true,
    build(value) {
      return { type: 'Whitespace', value: value || defaultValue };
    },
    *takeChrs() {
      return yield* takeChrs_(/\s+/);
    },
  };
};

const _ = Whitespace();

const stripArray = (value) => (isArray(value) ? value[0] : value);

export const D = (value) => Digit(stripArray(value));
export const PN = (value) => Punctuator(stripArray(value));
export const LPN = (value) => LeftPunctuator(stripArray(value));
export const RPN = (value) => RightPunctuator(stripArray(value));

// This simple grammar is useful to test the mechanics of hoisting
// matches [] and [1, 2, 3,]

export default {
  isHoistable: (token) => token.type === 'Whitespace',
  *Fragment() {
    yield* eat(ref`fragment`);
    yield* eatMatch(_);
  },
  generators: {
    *Array(path) {
      const { elements } = path.node;

      yield* eatMatch(_);
      yield* eat(LPN`[`);

      for (let i = 0; i < elements.length; i++) {
        yield* eat(ref`elements`);
        if (i + 1 === elements.length) {
          yield* eatMatch(_, PN`,`);
        } else {
          yield* eatMatch(_);
          yield* eat(PN`,`);
        }
      }

      yield* eatMatch(_);
      yield* eat(RPN`]`);
    },
    *Digit(path) {
      const { value } = path.node;

      yield* eatMatch(_);
      yield* eat(D(String(value)));
    },
  },
};
