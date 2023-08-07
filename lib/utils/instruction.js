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

export const buildProps = (ctx, matchable, state, mergeAttrs) => {
  const { type: tagType, value: tag } = matchable;
  let { attrs } = tag;

  if (mergeAttrs) {
    attrs = new Map(concat(attrs, mergeAttrs));
  }

  switch (tagType) {
    case 'GapTag': {
      return {
        context: facades.get(ctx),
        state: facades.get(state),
        path: facades.get(state.path),
        attrs: tag.attrs,
      };
    }

    case 'TokenTag': {
      return {
        context: facades.get(ctx),
        state: facades.get(state),
        value: tag.attrs.get('value'),
        attrs: tag.attrs,
      };
    }

    default:
      throw new Error();
  }
};
