import { parse as babelParse } from '@babel/parser';
import * as sym from '@cst-tokens/helpers/symbols';

export const parse = (sourceText) => {
  return babelParse(sourceText, { sourceType: 'module', ranges: false }).program;
};

import nodeGrammar from './node.js';
import tokenGrammar from './token.js';

export default {
  grammars: {
    [sym.node]: nodeGrammar,
    [sym.token]: tokenGrammar,
  },
};
