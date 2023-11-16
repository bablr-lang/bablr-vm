import { PathResolver } from '@bablr/boot-helpers/path';

const printAttributes = (attributes) => {
  const entries = Object.entries(attributes);
  return entries.length ? `{ ${entries.map(([k, v]) => `${k}: ${v}`).join(', ')} }` : '';
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
