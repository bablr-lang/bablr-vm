import { Match } from './match.js';
import { runSync } from './dispatcher.js';
import { Context } from './context.js';
import { __match as matchNode } from './matchers/node.js';
import { State } from './matchers/node.state.js';
import { __match as matchToken } from './matchers/token.js';
import { TokenizerState } from './matchers/token.state.js';
import * as sym from './symbols.js';

export const matchFrom = (context, state, type) => {
  const value = undefined;
  // should be type: sym.token?
  const matchable = { type: sym.node, production: { type, property: null, value } };

  return Match.from(context, state, matchable);
};

export function traverse(language, node, source, context = Context.from(language)) {
  const state = new Map([
    [sym.node, State.from(context, node.type)],
    [sym.token, TokenizerState.from(context, source)],
  ]);

  // Don't build this here anymore!
  const match = matchFrom(context, state, node.type);

  const matchers = new Map([
    [sym.node, matchNode],
    [sym.token, matchToken],
  ]);

  return runSync(match, matchers);
}
