import { interpolateString as _interpolateString } from "@bablr/boot-helpers/template";
import { interpolateArray as _interpolateArray } from "@bablr/boot-helpers/template";
import * as _t from "@bablr/boot-helpers/types";
import { spread } from '@bablr/boot-helpers/template';
import t from '@bablr/boot-helpers/types';
const {
  getPrototypeOf
} = Object;
export const transformTerminalMatcher = matcher => {
  const {
    type,
    attributes,
    value
  } = matcher.properties;
  return [_t.node("Spamex", "NodeMatcher", [_t.ref`open`, _t.ref`type`, _t.ref`close`], {
    open: _t.node("Spamex", "Punctuator", [_t.lit`<`], {}, {}),
    type: type,
    close: _t.node("Spamex", "Punctuator", [_t.lit`>`], {}, {})
  }, {}), buildObject({
    value,
    attributes
  })];
};
export const buildIdentifier = name => {
  return t.node('Instruction', 'Identifier', [t.lit(name)]);
};
export const buildCall = (verb, ...args) => {
  return t.node('Instruction', 'Call', [t.ref`verb`, t.ref`arguments`], {
    verb: buildIdentifier(verb),
    arguments: buildTuple(args)
  });
};
export const buildProperty = (key, value) => {
  return t.node('Instruction', 'Property', [t.ref`key`, t.ref`mapOperator`, t.trivia` `, t.ref`value`], {
    key: buildIdentifier(key),
    mapOperator: t.node('Instruction', 'Punctuator', [t.lit(':')]),
    value: buildExpression(value)
  });
};
export const buildString = value => {
  const terminals = [];
  let lit = '';
  for (const chr of value) {
    if (chr === "'") {
      if (lit) terminals.push({
        type: 'Literal',
        value: lit
      });
      terminals.push({
        type: 'Escape',
        value: {
          cooked: "'",
          raw: "\\'"
        }
      });
    } else if (chr === '\\') {
      if (lit) terminals.push({
        type: 'Literal',
        value: lit
      });
      terminals.push({
        type: 'Escape',
        value: {
          cooked: '\\',
          raw: '\\\\'
        }
      });
    } else {
      lit += chr;
    }
  }
  if (lit) terminals.push({
    type: 'Literal',
    value: lit
  });
  return _t.node("String", "String", [_t.ref`open`, _t.ref`content`, _t.ref`close`], {
    open: _t.node("String", "Punctuator", [_t.lit`'`], {}, {}),
    content: _interpolateString(terminals),
    close: _t.node("String", "Punctuator", [_t.lit`'`], {}, {})
  }, {});
};
export const buildBoolean = value => {
  return value ? _t.node("Instruction", "Boolean", [_t.ref`value`], {
    value: _t.node("Instruction", "Keyword", [_t.lit`true`], {}, {})
  }, {}) : _t.node("Instruction", "Boolean", [_t.ref`value`], {
    value: _t.node("Instruction", "Keyword", [_t.lit`false`], {}, {})
  }, {});
};
export const buildArray = elements => {
  // TODO security audit
  return _t.node("Instruction", "Array", [_t.ref`open`, _t.ref`elements`, _t.ref`close`], {
    open: _t.node("Instruction", "Punctuator", [_t.lit`[`], {}, {}),
    elements: [..._interpolateArray(spread(elements))],
    close: _t.node("Instruction", "Punctuator", [_t.lit`]`], {}, {})
  }, {});
};
export const buildTuple = elements => {
  return _t.node("Instruction", "Tuple", [_t.ref`open`, _t.ref`values`, _t.ref`close`], {
    open: _t.node("Instruction", "Punctuator", [_t.lit`(`], {}, {}),
    values: [..._interpolateArray(spread(elements))],
    close: _t.node("Instruction", "Punctuator", [_t.lit`)`], {}, {})
  }, {});
};
export const buildObject = properties => {
  return _t.node("Instruction", "Object", [_t.ref`open`, _t.ref`properties`, _t.ref`close`], {
    open: _t.node("Instruction", "Punctuator", [_t.lit`{`], {}, {}),
    properties: [..._interpolateArray(spread(Object.entries(properties).map(([key, value]) => buildProperty(key, value))))],
    close: _t.node("Instruction", "Punctuator", [_t.lit`}`], {}, {})
  }, {});
};
export const buildExpression = expr => {
  if (expr == null) return expr;
  switch (typeof expr) {
    case 'boolean':
      return buildBoolean(expr);
    case 'string':
      return buildString(expr);
    case 'object':
      {
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
