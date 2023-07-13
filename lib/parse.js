import { Match } from './match.js';
import { Context } from './context.js';
import { Source } from './source.js';
import { Path } from './path.js';
import { runSync } from './trampolines/dispatcher.js';
import { exec as execNode } from './trampolines/node.parse.js';
import { State } from './trampolines/node.state.js';
import { exec as execToken } from './trampolines/token.js';
import { TokenizerState } from './trampolines/token.state.js';
import * as sym from './symbols.js';

export function parse(language, sourceText, type, value) {
  const context = Context.from(language);
  const source = Source.from(context, sourceText);
  const path = Path.from(context);
  const state = new Map([
    [sym.node, State.from(context, path)],
    [sym.token, TokenizerState.from(context)],
  ]);

  const trampolines = new Map([
    [sym.node, execNode],
    [sym.token, execToken],
  ]);

  const matchable = {
    type: sym.node,
    production: { type, value },
  };

  const match = Match.from(context, state, source, matchable);

  return runSync(trampolines, match);
}
