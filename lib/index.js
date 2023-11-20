import { printTerminal } from './print.js';
import { parse } from './parse.js';
export { parse };

export { printCSTML, printTerminal } from './print.js';
export { ContextFacade as Context } from './context.js';

export const parseCSTML = (...args) => {
  return [...parse(...args)].map(printTerminal).join('');
};
