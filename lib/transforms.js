import { i, spam, str, cst } from '@bablr/boot/shorthand.macro';
import { spread } from '@bablr/boot-helpers/template';
import t from '@bablr/boot-helpers/types';

const { getPrototypeOf } = Object;

const transformAttributes = (attributes) => {
  const properties = attributes.map((attr) => {
    switch (attr.type) {
      case 'StringAttribute': {
        const { key, value } = attr.properties;

        return t.node(
          'Instruction',
          'Property',
          [t.ref`key`, t.ref`mapOperator`, t.trivia` `, t.ref`value`],
          {
            key,
            value,
          },
        );
        // return i.Property`${key}: ${value}`;
      }

      case 'BooleanAttribute': {
        const { key } = attr.properties;

        return t.node(
          'Instruction',
          'Property',
          [t.ref`key`, t.ref`mapOperator`, t.trivia` `, t.ref`value`],
          {
            key,
            value: i.Expression`true`,
          },
        );
        // return i.Property`${key}: true`;
      }

      default:
        throw new Error();
    }
  });

  return i.Expression`{${spread(properties)}}`;
};

export const transformTerminalMatcher = (matcher) => {
  const { type, attributes, value } = matcher.properties;

  const attrs = transformAttributes(attributes);

  return [spam`<${type}>`, buildObject({ value, attrs })];
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
    // spread isn't handling children!
    Object.entries(properties).map(([key, value]) => buildProperty(key, value)),
  )}}`;
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
          return buildObject(expr);
        default:
          throw new Error();
      }
    }
    default:
      throw new Error();
  }
};

export const buildNodeOpenTag = (type, path, attributes) => {
  return cst.OpenNodeTag`<${type} .${path} ${attributes}>`;
};

export const buildNodeCloseTag = () => {
  return cst.CloseNodeTag`</>`;
};
