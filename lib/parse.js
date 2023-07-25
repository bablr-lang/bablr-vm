import { Match } from './match.js';
import { Context } from './context.js';
import { Source } from './source.js';
import { Path } from './path.js';
import { Element } from './element.js';
import { Tag } from './tag.js';
import { runSync } from './trampolines/dispatcher.js';
import { exec as execNode } from './trampolines/node.parse.js';
import { State } from './trampolines/node.state.js';
import { exec as execToken } from './trampolines/token.js';
import { TokenizerState } from './trampolines/token.state.js';
import { DispatcherState } from './trampolines/dispatcher.state.js';
import * as sym from './symbols.js';

export function parse(language, sourceText, gapType, attrs = {}) {
  const context = Context.from(language);
  const source = Source.from(context, sourceText);
  const gapTag = Tag.from(null, gapType);
  const path = Path.from(context, Element.from(gapTag));
  const state = DispatcherState.from(
    context,
    new Map([
      [sym.node, State.from(context, path)],
      [sym.token, TokenizerState.from(context, source)],
    ]),
  );

  const trampolines = new Map([
    [sym.node, execNode],
    [sym.token, execToken],
  ]);

  const matchable = {
    type: sym.node,
    production: { type: gapType, attrs },
  };

  const match = Match.from(context, state, matchable);

  return runSync(trampolines, match);
}
