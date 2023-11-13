import * as sym from '../symbols.js';
import { facades } from './facades.js';
import { getCooked } from './token.js';

export const shouldBranch = (effects) => {
  return effects.success === sym.none || effects.failure === sym.none;
};

export const reifyExpression = (node) => {
  if (!node) return null;

  if (node.language !== 'Instruction') {
    return node;
  }

  switch (node.type) {
    case 'Object': {
      const { properties } = node.properties;

      return Object.fromEntries(
        properties.map(({ properties: { key, value } }) => [
          getCooked(key),
          reifyExpression(value),
        ]),
      );
    }

    case 'Array': {
      const { elements } = node.properties;

      return [...elements.map((el) => reifyExpression(el))];
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

export const reifyArgs = (props, state, ctx) => {
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
