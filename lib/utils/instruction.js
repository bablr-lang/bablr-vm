import * as sym from '../symbols.js';
import { facades } from './facades.js';

export const validateInstruction = (instr) => {
  return instr;
};

export const shouldBranch = (effects) => {
  return effects.success === sym.none || effects.failure === sym.none;
};

export const buildProps = (ctx, matchable, state) => {
  const { type: tagType, value: tag } = matchable;

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
        path: facades.get(state.path),
        attrs: tag.attrs,
      };
    }

    default:
      throw new Error();
  }
};
