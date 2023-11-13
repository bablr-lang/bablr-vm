import { interpolateString as _interpolateString } from "@bablr/boot-helpers/template";
import { interpolateArray as _interpolateArray } from "@bablr/boot-helpers/template";
import * as _t from "@bablr/boot-helpers/types";
import { spread } from '@bablr/boot-helpers/template';
import t from '@bablr/boot-helpers/types';
const transformAttributes = attributes => {
  const properties = attributes.map(attr => {
    switch (attr.type) {
      case 'StringAttribute':
        {
          const {
            key,
            value
          } = attr.properties;
          return t.node('Instruction', 'Property', [t.ref`key`, t.ref`mapOperator`, t.trivia` `, t.ref`value`], {
            key,
            value
          });
          // return i.Property`${key}: ${value}`;
        }

      case 'BooleanAttribute':
        {
          const {
            key
          } = attr.properties;
          return t.node('Instruction', 'Property', [t.ref`key`, t.ref`mapOperator`, t.trivia` `, t.ref`value`], {
            key,
            value: _t.node("Instruction", "Boolean", [_t.ref`value`], {
              value: _t.node("Instruction", "Keyword", [_t.lit`true`], {}, {})
            }, {})
          });
          // return i.Property`${key}: true`;
        }

      default:
        throw new Error();
    }
  });
  return _t.node("Instruction", "Object", [_t.ref`open`, _t.ref`properties`, _t.ref`close`], {
    open: _t.node("Instruction", "Punctuator", [_t.lit`{`], {}, {}),
    properties: [..._interpolateArray(spread(properties))],
    close: _t.node("Instruction", "Punctuator", [_t.lit`}`], {}, {})
  }, {});
};
export const transformTokenMatcher = matcher => {
  const {
    type,
    attributes,
    value
  } = matcher.properties;
  const attrs = transformAttributes(attributes);
  return [_t.node("Spamex", "NodeMatcher", [_t.ref`open`, _t.ref`type`, _t.ref`close`], {
    open: _t.node("Spamex", "Punctuator", [_t.lit`<`], {}, {}),
    type: type,
    close: _t.node("Spamex", "Punctuator", [_t.lit`>`], {}, {})
  }, {}), _t.node("Instruction", "Object", [_t.ref`open`, _t.trivia` `, _t.ref`properties`, _t.trivia` `, _t.ref`properties`, _t.trivia` `, _t.ref`close`], {
    open: _t.node("Instruction", "Punctuator", [_t.lit`{`], {}, {}),
    properties: [_t.node("Instruction", "Property", [_t.ref`key`, _t.ref`mapOperator`, _t.trivia` `, _t.ref`value`], {
      key: _t.node("Instruction", "Literal", [_t.lit`value`], {}, {}),
      mapOperator: _t.node("Instruction", "Punctuator", [_t.lit`:`], {}, {}),
      value: value
    }, {}), _t.node("Instruction", "Property", [_t.ref`key`, _t.ref`mapOperator`, _t.trivia` `, _t.ref`value`], {
      key: _t.node("Instruction", "Literal", [_t.lit`attrs`], {}, {}),
      mapOperator: _t.node("Instruction", "Punctuator", [_t.lit`:`], {}, {}),
      value: attrs
    }, {})],
    close: _t.node("Instruction", "Punctuator", [_t.lit`}`], {}, {})
  }, {})];
};
export const buildCall = (verb, ...args) => {
  return t.node('Instruction', 'Call', [t.ref`verb`, t.ref`arguments`], {
    verb: t.node('Instruction', 'Identifier', [t.lit(verb)]),
    arguments: _t.node("Instruction", "Tuple", [_t.ref`open`, _t.ref`values`, _t.ref`close`], {
      open: _t.node("Instruction", "Punctuator", [_t.lit`(`], {}, {}),
      values: [..._interpolateArray(spread(args))],
      close: _t.node("Instruction", "Punctuator", [_t.lit`)`], {}, {})
    }, {})
  });
};
export const buildString = value => {
  return _t.node("String", "String", [_t.ref`open`, _t.ref`content`, _t.ref`close`], {
    open: _t.node("String", "Punctuator", [_t.lit`'`], {}, {}),
    content: _interpolateString(value),
    close: _t.node("String", "Punctuator", [_t.lit`'`], {}, {})
  }, {});
};
