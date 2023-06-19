import { Match } from './match.js';
import { runSync } from './dispatcher.js';
import { Context } from './context.js';
import { Path } from './path.js';
import { __match as matchNode } from './matchers/node.js';
import { State } from './matchers/node.state.js';
import { __match as matchToken } from './matchers/token.js';
import { TokenizerState } from './matchers/token.state.js';
import * as sym from './symbols.js';

export const matchFrom = (matchers, context, state) => {
  const value = undefined;
  const matchable = { type: sym.token, production: { type: 'Token', value } };

  return Match.from(matchers, context, state, matchable);
};

export function traverse(language, node, source, context = Context.from(language)) {
  const path = Path.from(context, node);
  const state = new Map([
    [sym.node, State.from(context, path)],
    [sym.token, TokenizerState.from(context, source)],
  ]);

  const matchers = new Map([
    [sym.node, matchNode],
    [sym.token, matchToken],
  ]);

  const match = matchFrom(matchers, context, state);

  return runSync(matchers, match, source);
}
