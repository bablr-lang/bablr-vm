import { i, spam, str, cstml } from '@bablr/boot/shorthand.macro';
import { spread } from '@bablr/boot-helpers/template';
import t from '@bablr/boot-helpers/types';

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

export const transformTokenMatcher = (matcher) => {
  const { type, attributes, value } = matcher.properties;

  const attrs = transformAttributes(attributes);

  return [spam`<${type}>`, i.Expression`{ value: ${value} attrs: ${attrs} }`];
};

export const buildCall = (verb, ...args) => {
  return t.node('Instruction', 'Call', [t.ref`verb`, t.ref`arguments`], {
    verb: t.node('Instruction', 'Identifier', [t.lit(verb)]),
    arguments: i.Tuple`(${spread(args)})`,
  });
};

export const buildString = (value) => {
  return str`'${value}'`;
};

export const buildNodeOpenTag = (type, path, attributes) => {
  return cstml`<${type} .${path} ${attributes}>`;
};
