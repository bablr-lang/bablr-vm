import { PathResolver } from './path.js';
import isString from 'iter-tools-es/methods/is-string';
import isArray from 'iter-tools-es/methods/is-array';

const { isInteger, isFinite } = Number;

const isNumber = (val) => typeof val === 'number';

const printExpression = (expr) => {
  if (isString(expr)) {
    return `'${expr.replace(/['\\]/g, '\\$&')}'`;
  } else if (expr == null || typeof expr === 'boolean') {
    return String(expr);
  } else if (isNumber(expr)) {
    if (!isInteger(expr) && isFinite(expr)) {
      throw new Error();
    }
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

const escapeReplacer = (esc) => {
  if (esc === '\r') {
    return '\\r';
  } else if (esc === '\n') {
    return '\\n';
  } else if (esc === '\0') {
    return '\\0';
  } else {
    return `\\${esc}`;
  }
};

export const printSingleString = (str) => {
  return `'${str.replace(/['\\\0\r\n]/g, escapeReplacer)}'`;
};

export const printDoubleString = (str) => {
  return `'${str.replace(/["\\\0\r\n]/g, escapeReplacer)}'`;
};

export const printString = (str) => {
  return str === "'" ? printDoubleString(str) : printSingleString(str);
};

export const printTerminal = (terminal) => {
  if (terminal.type === 'Literal') {
    return printString(terminal.value);
  } else if (terminal.type === 'Escape') {
    return `!${printString(terminal.value.raw)} :${printString(terminal.value.cooked)}`;
  } else if (terminal.type === 'Trivia') {
    return `#${printString(terminal.value)}`;
  } else if (terminal.type === 'OpenNode') {
    const { type, attributes } = terminal.value.tag;
    const printedAttributes = printAttributes(attributes);
    const attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';

    return `<${type}${attributesFrag}>`;
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

  let printed = '';

  const { type, attributes } = node;
  const printedAttributes = printAttributes(attributes);
  const attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';

  printed += `<${type}${attributesFrag}>`;

  const resolver = new PathResolver(node);

  for (const terminal of node.children) {
    if (terminal.type === 'Reference') {
      printed += `${terminal.value}:`;
      printed += printCSTML(resolver.get(terminal.value));
    } else {
      printed += printTerminal(terminal);
    }
  }

  printed += `</>`;

  return printed;
};

export const printPrettyCSTML = (node, indent = '  ', indentLevel = 0) => {
  if (!node) {
    return '<//>';
  }

  const resolver = new PathResolver(node);
  let printed = '';

  const { type, attributes } = node;
  const printedAttributes = printAttributes(attributes);
  const attributesFrag = printedAttributes ? ` ${printedAttributes}` : '';

  printed += indent.repeat(indentLevel);
  printed += `<${type}${attributesFrag}>\n`;

  for (const terminal of node.children) {
    if (terminal.type === 'Reference') {
      printed += indent.repeat(indentLevel + 1);
      printed += `${terminal.value}:`;
      printed += '\n';
      printed += printPrettyCSTML(resolver.get(terminal.value), indent, indentLevel + 1);
    } else {
      printed += indent.repeat(indentLevel + 1);
      printed += printTerminal(terminal);
      printed += '\n';
    }
  }

  printed += indent.repeat(indentLevel);
  printed += `</>\n`;

  return printed;
};

export const streamPrintCSTML = (terminals) => {
  if (!terminals) {
    return '<//>';
  }

  let printed = '';

  for (const terminal of terminals) {
    if (terminal.type === 'OpenNode') {
      printed += `${terminal.value.path}:`;
    }
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
        if (!first) {
          printed += `${terminal.value.path}:`;
          printed += '\n';
          printed += indent.repeat(indentLevel);
        }
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
