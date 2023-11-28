import { i, spam, str } from '@bablr/boot/shorthand.macro';
import { spread } from '@bablr/boot-helpers/template';
import t from '@bablr/boot-helpers/types';

const { getPrototypeOf } = Object;

export const transformTerminalMatcher = (matcher) => {
  const { type, attributes, value } = matcher.properties;

  return buildTuple([spam`<${type}>`, buildObject({ value, attributes })]);
};

export const buildIdentifier = (name) => {
  return t.node('Instruction', 'Identifier', [t.lit(name)]);
};

export const buildCall = (verb, ...args) => {
  return t.node('Instruction', 'Call', [t.ref`verb`, t.ref`arguments`], {
    verb: buildIdentifier(verb),
    arguments: buildTuple(args),
  });
};

export const buildProperty = (key, value) => {
  return t.node(
    'Instruction',
    'Property',
    [t.ref`key`, t.ref`mapOperator`, t.trivia` `, t.ref`value`],
    {
      key: buildIdentifier(key),
      mapOperator: t.node('Instruction', 'Punctuator', [t.lit(':')]),
      value: buildExpression(value),
    },
  );
};

export const buildString = (value) => {
  const terminals = [];
  let lit = '';

  for (const chr of value) {
    if (chr === "'") {
      if (lit) terminals.push({ type: 'Literal', value: lit });
      terminals.push({ type: 'Escape', value: { cooked: "'", raw: "\\'" } });
    } else if (chr === '\\') {
      if (lit) terminals.push({ type: 'Literal', value: lit });
      terminals.push({ type: 'Escape', value: { cooked: '\\', raw: '\\\\' } });
    } else {
      lit += chr;
    }
  }

  if (lit) terminals.push({ type: 'Literal', value: lit });

  return str`'${terminals}'`;
};

export const buildBoolean = (value) => {
  return value ? i.Boolean`true` : i.Boolean`false`;
};

export const buildArray = (elements) => {
  // TODO security audit
  return i.Expression`[${spread(elements)}]`;
};

export const buildTuple = (elements) => {
  return i.Expression`(${spread(elements)})`;
};

export const buildObject = (properties) => {
  return i.Expression`{${spread(
    Object.entries(properties).map(([key, value]) => buildProperty(key, value)),
  )}}`;
};

export const buildAttributes = (attributes) => {
  return Object.entries(attributes).map(([key, value]) => buildAttribute(key, value));
};

export const buildAttribute = (key, value) => {
  return t.node('CSTML', 'Attribute', [t.ref`key`, t.ref`mapOperator`, t.ref`value`], {
    key: buildIdentifier(key),
    mapOperator: t.node('CSTML', 'Punctuator', [t.lit('=')]),
    value: buildExpression(value),
  });
};

export const buildExpression = (expr) => {
  if (expr == null) return expr;

  switch (typeof expr) {
    case 'boolean':
      return buildBoolean(expr);
    case 'string':
      return buildString(expr);
    case 'object': {
      switch (getPrototypeOf(expr)) {
        case Array.prototype:
          return buildArray(expr);
        case Object.prototype:
          if (expr.type && expr.language && expr.children && expr.properties) {
            return expr;
          }
          return buildObject(expr);
        default:
          throw new Error();
      }
    }
    default:
      throw new Error();
  }
};
