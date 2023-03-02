import { Grammar } from '@cst-tokens/helpers/grammar';

import * as nodeGrammar from './node.js';
import * as tokenGrammar from './token.js';

export default {
  grammars: {
    node: new Grammar(nodeGrammar),
    token: new Grammar(tokenGrammar),
  },
};
