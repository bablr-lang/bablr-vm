import { facades } from './utils/facades.js';
import { Match } from './match.js';
import { runSync } from './dispatcher.js';
import { Context } from './context.js';
import { Path } from './path.js';
import { __match as matchNode } from './matchers/node.js';
import { State } from './matchers/node.state.js';
import { __match as matchToken } from './matchers/token.js';
import { TokenizerState } from './matchers/token.state.js';
import { __tokenize } from './tokenize.js';
import * as sym from './symbols.js';

export const matchFrom = (context, state, path, type) => {
  const value = undefined;
  const type_ = path ? path.node.type : type;
  const matchable = { type: sym.node, value: { type: type_, property: null, value } };

  const m = Match.from(context, state, matchable, { path: facades.get(path), value });

  context.pathsMap.set(m, path);

  return m;
};

export function traverse(language, node, source, context = Context.from(language)) {
  const path = Path.from(context, node);
  const state = State.from(context, node.type);
  const tokenState = TokenizerState.from(context, source);

  // Don't build this here anymore!
  const match = matchFrom(context, state, path, node.type);

  const engines = {
    [sym.node]: Engine.from(sym.node, matchNode, context, state),
    [sym.token]: Engine.from(sym.token, matchToken, context, tokenState),
  };

  return runSync(match, engines);
}
