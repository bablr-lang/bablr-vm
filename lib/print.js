import { PathResolver } from '@bablr/boot-helpers/path';
import isString from 'iter-tools-es/methods/is-string';
import isArray from 'iter-tools-es/methods/is-array';

const printExpression = (expr) => {
  if (isString(expr)) {
    return `'${expr.replace(/['\\]/g, '\\$&')}'`;
  } else if (expr == null || typeof expr === 'boolean') {
    return String(expr);
  } else if (isArray(expr)) {
    return `[${expr.map((v) => printExpression(v)).join(', ')}]`;
  } else if (typeof expr === 'object') {
    return `{${Object.entries(expr).map(([k, v]) => `${k}: ${printExpression(v)}`)}}`;
  } else {
    throw new Error();
  }
};

const printAttributes = (attributes) => {
  return Object.entries(attributes)
    .map(([k, v]) => (v === true ? k : `${k}=${printExpression(v)}`))
    .join(' ');
};

export const printTerminal = (terminal) => {
  if (terminal.type === 'Literal' || terminal.type === 'Trivia') {
    return `'${terminal.value.replace(/['\\]/g, '\\$&')}'`;
  } else if (terminal.type === 'Escape') {
    return terminal.raw.value;
  } else if (terminal.type === 'OpenNode') {
    const { path, type, attributes } = terminal.value;
    const pathFrag = path ? ` .${path}` : '';
    const printedAttributes = printAttributes(attributes);
    const attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';

    return `<${type}${pathFrag}${attributesFrag}>`;
  } else if (terminal.type === 'CloseNode') {
    return `</>`;
  } else {
    throw new Error();
  }
};

export const print = (node) => {
  if (!node) {
    return '<//>';
  }

  const resolver = new PathResolver(node);
  let printed = '';

  for (const terminal of node.children) {
    printed += printTerminal(terminal, resolver);
  }

  return printed;
};
