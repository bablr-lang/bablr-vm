import { syntaxGrammar } from './syntax.js';
import { tokenGrammar } from './token.js';

export default {
  grammars: {
    token: tokenGrammar,
    syntax: syntaxGrammar,
  },
};
