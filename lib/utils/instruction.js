import * as sym from '../symbols.js';
import { facades } from './facades.js';

export const validateInstruction = (instr) => {
  return instr;
};

export const shouldBranch = (effects) => {
  return effects.success === sym.none || effects.failure === sym.none;
};

export const buildProps = (ctx, instr, m) => {
  const { type: grammarType, production } = instr.value.matchable;
  const { attrs } = production;

  switch (grammarType) {
    case sym.node: {
      return {
        context: facades.get(ctx),
        state: facades.get(m.s),
        path: facades.get(m.s.path),
        attrs,
      };
    }

    case sym.token: {
      return {
        context: facades.get(ctx),
        state: facades.get(m.s),
        path: facades.get(m.s.path),
        attrs,
      };
    }
  }
};
