import { Context } from './context.js';
import { Source } from './source.js';
import { runSync } from './run.js';
import { dispatcher } from './dispatcher.js';

export function parse(language, sourceText, gapType, attrs = new Map()) {
  const ctx = Context.from(language);
  const source = Source.from(ctx, sourceText);
  const matchable = { type: 'GapTag', value: { type: gapType, attrs } };

  return runSync(dispatcher(ctx, source, matchable));
}
