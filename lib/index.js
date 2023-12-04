import { streamPrintPrettyCSTML } from './print.js';
import { streamParse } from './parse.js';

export { parse, streamParse } from './parse.js';
export {
  printCSTML,
  printPrettyCSTML,
  streamPrintCSTML,
  streamPrintPrettyCSTML,
  printTerminal,
} from './print.js';
export { ContextFacade as Context } from './context.js';

export const parseCSTML = (...args) => {
  return streamPrintPrettyCSTML(streamParse(...args));
};
