import * as sym from '../symbols.js';
import { facades } from './facades.js';
import { getCooked } from './token.js';

export const shouldBranch = (effects) => {
  return effects ? effects.success === sym.none || effects.failure === sym.none : false;
};

export const reifyExpression = (node) => {
  if (!node) return null;

  if (!['Instruction', 'String'].includes(node.language)) {
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

    case 'Tuple': {
      const { values } = node.properties;

      return [...values.map((el) => reifyExpression(el))];
    }

    case 'Array': {
      const { elements } = node.properties;

      return [...elements.map((el) => reifyExpression(el))];
    }

    case 'String':
      return node.properties.content ? getCooked(node.properties.content) : '';

    case 'Boolean': {
      // prettier-ignore
      switch (getCooked(node)) {
        case 'true': return true;
        case 'false': return false;
        default: throw new Error();
      }
    }

    case 'Null':
      return null;

    default:
      throw new Error('bad expression');
  }
};

export const reifyExpressionShallow = (node) => {
  if (!node) return null;

  if (!['Instruction', 'String'].includes(node.language)) {
    return node;
  }

  switch (node.type) {
    case 'Object': {
      const { properties } = node.properties;

      return Object.fromEntries(
        properties.map(({ properties: { key, value } }) => [getCooked(key), value]),
      );
    }

    case 'Array':
      return [...node.properties.elements];

    case 'Tuple':
      return [...node.properties.values];

    default:
      return reifyExpression(node);
  }
};

export const parsePath = (str) => {
  const pathIsArray = str.endsWith('[]');
  const pathName = pathIsArray ? str.slice(0, -2) : str;

  if (!/^\w+$/.test(pathName)) throw new Error();

  return { pathIsArray, pathName };
};

export const parseAttributes = (attributes) => {
  if (attributes == null) return {};

  return Object.fromEntries(
    attributes.map((attr) => {
      if (attr.type === 'MappingAttribute') {
        return [getCooked(attr.properties.key), reifyExpression(attr.properties.value)];
      } else if (attr.type === 'BooleanAttribute') {
        return [getCooked(attr.properties.key), true];
      } else {
        throw new Error();
      }
    }),
  );
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
