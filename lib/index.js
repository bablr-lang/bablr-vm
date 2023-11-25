import { printTerminal } from './print.js';
import { parse } from './parse.js';

export { parse, streamParse } from './parse.js';
export { printCSTML, printPrettyCSTML, streamPrintCSTML, streamPrintPrettyCSTML } from './print.js';
export { ContextFacade as Context } from './context.js';

export const parseCSTML = (...args) => {
  return [...parse(...args)].map(printTerminal).join('');
};
