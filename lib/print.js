import { PathResolver } from './path.js';
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

export const printCSTML = (node) => {
  if (!node) {
    return '<//>';
  }

  const resolver = new PathResolver(node);
  let printed = '';

  for (const terminal of node.children) {
    if (terminal.type === 'Reference') {
      printed += printCSTML(resolver.get(terminal.value));
    } else {
      printed += printTerminal(terminal);
    }
  }

  return printed;
};

export const printPrettyCSTML = (node, indent = '  ', indentLevel = 0) => {
  if (!node) {
    return '<//>';
  }

  const resolver = new PathResolver(node);
  let printed = '';

  for (const terminal of node.children) {
    if (terminal.type === 'Reference') {
      printed += printPrettyCSTML(resolver.get(terminal.value), indent, indentLevel + 1);
    } else {
      printed += indent.repeat(indentLevel);
      printed += printTerminal(terminal);
    }
  }

  return printed;
};

export const streamPrintCSTML = (terminals) => {
  if (!terminals) {
    return '<//>';
  }

  let printed = '';

  for (const terminal of terminals) {
    printed += printTerminal(terminal);
  }

  return printed;
};

export const streamPrintPrettyCSTML = (terminals, indent = '  ') => {
  if (!terminals) {
    return '<//>';
  }

  let printed = '';
  let indentLevel = 0;
  let first = true;

  for (const terminal of terminals) {
    if (!first) {
      printed += '\n';
    }

    switch (terminal.type) {
      case 'OpenNode':
        printed += indent.repeat(indentLevel);
        printed += printTerminal(terminal);
        indentLevel++;
        break;

      case 'CloseNode':
        indentLevel--;
        printed += indent.repeat(indentLevel);
        printed += printTerminal(terminal);
        break;

      default:
        printed += indent.repeat(indentLevel);
        printed += printTerminal(terminal);
        break;
    }

    first = false;
  }

  return printed;
};
