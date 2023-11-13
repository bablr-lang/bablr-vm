import { isArray } from 'iter-tools-es';
import * as sym from '../symbols.js';
import { facades } from './facades.js';
import { getCooked } from './token.js';

export const validateInstruction = (instr) => {
  return instr;
};

export const shouldBranch = (effects) => {
  return effects.success === sym.none || effects.failure === sym.none;
};

export const buildExpression = (node) => {
  if (!node) return {};

  if (isArray(node)) {
    return node.map((el) => buildExpression(el));
  }

  if (node.language !== 'Instruction') {
    return node;
  }

  switch (node.type) {
    case 'Object': {
      const { properties } = node.properties;

      return Object.fromEntries(
        properties.map(({ properties: { key, value } }) => [
          getCooked(key),
          buildExpression(value),
        ]),
      );
    }

    case 'Array': {
      const { elements } = node.properties;

      return [...elements.map((el) => buildExpression(el))];
    }

    case 'Boolean': {
      // prettier-ignore
      switch (getCooked(node)) {
        case 'true': return true;
        case 'false': return false;
        default: throw new Error();
      }
    }

    default:
      throw new Error('bad expression');
  }
};

export const buildArgs = (props, state, ctx) => {
  return [props, facades.get(state), facades.get(ctx)];
};

export const effectsFor = (verb) => {
  // prettier-ignore
  switch (verb) {
    case 'eat': return { success: sym.eat, failure: sym.fail };
    case 'eatMatch': return { success: sym.eat, failure: sym.none };
    case 'match': return { success: sym.none, failure: sym.none };
    case 'guard': return { success: sym.none, failure: sym.fail };
    default: throw new Error('invalid match verb')
  }
};
