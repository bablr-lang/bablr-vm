import { streamPrintPrettyCSTML } from './print.js';
import { streamParseSync } from './parse.js';

export { evaluateSync, evaluateAsync, runSync, runAsync, evaluate } from './evaluate.js';
export { streamParseSync, streamParseAsync, parseSync, parseTrampoline } from './parse.js';
export {
  printCSTML,
  printPrettyCSTML,
  streamPrintCSTML,
  streamPrintPrettyCSTML,
  printTerminal,
} from './print.js';

export const parseCSTMLSync = (...args) => {
  return streamPrintPrettyCSTML(streamParseSync(...args));
};
