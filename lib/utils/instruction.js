import * as sym from '../symbols.js';
import { facades } from './facades.js';

function* concat(...iterables) {
  for (const iterable of iterables) yield* iterable;
}

export const validateInstruction = (instr) => {
  return instr;
};

export const shouldBranch = (effects) => {
  return effects.success === sym.none || effects.failure === sym.none;
};

export const buildAttrs = (attrs) => {
  return new Map([...attrs].map(({ value: { key, value } }) => [key, value]));
};

export const buildProps = (ctx, matchable, state) => {
  const { type: tagType, value: tag } = matchable;
  let { attrs } = tag;

  switch (tagType) {
    case 'NodeMatcher': {
      return {
        context: facades.get(ctx),
        state: facades.get(state),
        path: facades.get(state.path),
        attrs: buildAttrs(tag.attrs),
      };
    }

    case 'TokenMatcher': {
      return {
        context: facades.get(ctx),
        state: facades.get(state),
        value: tag.value,
        attrs: tag.attrs,
      };
    }

    default:
      throw new Error();
  }
};
