import { Match } from './match.js';
import { Context } from './context.js';
import { Source } from './source.js';
import { runSync } from './trampolines/dispatcher.js';
import { exec as execToken } from './trampolines/token.js';
import { TokenizerState } from './trampolines/token.state.js';
import * as sym from './symbols.js';

export function tokenize(language, sourceText, type, value) {
  const context = Context.from(language);
  const source = Source.from(context, sourceText);
  const state = new Map([[sym.token, TokenizerState.from(context)]]);
  const trampolines = new Map([[sym.token, execToken]]);
  const matchable = { type: sym.token, production: { type, value } };

  const match = Match.from(context, state, source, matchable);

  return runSync(trampolines, match);
}
