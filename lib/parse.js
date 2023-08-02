import { facades } from './utils/facades.js';
import { validateInstruction, shouldBranch } from './utils/instruction.js';
import { createTokenTag } from './utils/token.js';
import { emit, dispatch } from './utils/shorthand.js';
import { Coroutine } from './coroutine.js';
import { Context } from './context.js';
import { Source } from './source.js';
import { Path } from './path.js';
import { runSync } from './run.js';
import { dispatcher } from './dispatcher.js';
import * as sym from './symbols.js';
import { rejected } from './symbols.js';

const defer = Symbol('defer');

export function parse(language, sourceText, gapType, attrs = {}) {
  const ctx = Context.from(language);
  const source = Source.from(ctx, sourceText);
  const matchable = { type: sym.node, production: { type: gapType, attrs } };

  return runSync(dispatcher(ctx, state, __parse(ctx, matchable)));
}

export function* __parse(ctx, rootMatchable) {
  const nodeGrammar = ctx.grammars.get(sym.node);
  const tokenGrammar = ctx.grammars.get(sym.token);

  let m = yield dispatch({
    effects: { success: sym.none, failure: sym.none },
    matchable: rootMatchable,
  });
  let { s } = m;

  m.co.advance();

  m.precedingTag = s.lastTag;

  if (nodeGrammar.is('Node', m.production.type)) {
    if (!shouldBranch(m.effects)) {
      throw new Error();
      // yield emit(openTagFor(s.path));
    }
  }

  for (;;) {
    while (!m.co.done) {
      const instr = validateInstruction(m.co.value);

      let returnValue = undefined;

      switch (instr.type) {
        case sym.match: {
          const { effects, matchable } = instr.value;

          if (matchable.type === sym.node) {
            const { production } = matchable;
            const { type, attrs } = production;
            const { path: segment } = attrs;

            if (nodeGrammar.is('Node', type)) {
              s = shouldBranch(effects) ? s.branch() : s;

              if (s.path.depth && !segment) throw new Error('segment is missing');

              if (nodeGrammar.aliases.has(type)) {
                const openTag = Tag.from(null, type, { path: segment });

                s.path = s.path.push(new Path(ctx, Element.from(openTag)));
              } else {
                const { type: gapType } = s.path;
                const openTag = Tag.from(type, gapType, { path: segment });

                s.path = s.path.replace(new Path(ctx, Element.from(openTag)));

                if (!shouldBranch(effects)) {
                  yield emit({
                    type: 'OpenTag',
                    value: {
                      type: s.path.type,
                      attributes: { path: s.path.segment || null },
                    },
                  });
                }
              }
            } else {
              s = shouldBranch(effects) ? s.branch() : s;
            }

            m = yield { type: sym.dispatch, value: instr.value };
            m.co.advance();

            returnValue = defer;
          } else if (matchable.type === sym.token) {
            // if (s.path.isGap && effects.success === sym.eat) {
            //   throw new Error('Cannot eat tokens outside of a node');
            // }

            const { type, attrs } = matchable.production;
            const { startSpan, endSpan } = attrs;

            if (tokenGrammar.is('Token', type)) {
              if (s.match) {
                throw new Error('A token is already started');
              }

              s.match = { type, value: '' };
            } else {
              if (startSpan || endSpan) {
                throw new Error();
              }
            }

            m = m.exec(instr.value);
            ({ s } = m);

            m.precedingTag = s.lastTag;
            m.co = new Coroutine(
              tokenGrammar.get(type).match({
                context: facades.get(ctx),
                state: facades.get(s),
                attrs,
              }),
            );

            m.co.advance();
          } else if (matchable.type === sym.character) {
            if (!s.match && effects.success === sym.eat) {
              throw new Error('Grammar must not eat characters outside a token');
            }

            const result = yield instr;

            if (result) {
              if (effects.success === sym.eat) {
                s.match.value += result;
                s.source.advance(result.length);
              }
            } else {
              if (effects.failure === sym.reject) {
                s.match = null;
                m.terminate();
              }
            }
            returnValue = result;
          } else {
            returnValue = yield instr;
          }
          break;
        }

        default: {
          returnValue = yield instr;
          break;
        }
      }

      if (s.status === rejected) {
        break;
      }

      if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!m.co.done) {
        m.co.advance(returnValue);
      }
    }

    // resume suspended execution

    {
      const completedMatch = m;

      if (!m.empty && !s.speculative) {
        if (nodeGrammar.is('Node', m.production)) {
          const finalTag = {
            type: 'CloseTag',
            value: { type: completedMatch.production.type },
          };

          m.finalTag = finalTag;

          if (!s.speculative) {
            yield emit(finalTag);
          }
        } else if (tokenGrammar.is('Token', m.production.type)) {
          if (!s.match) throw new Error('No token is started');

          if (s.match.value) {
            const { type, value } = s.match;

            if (/\r|\n/.test(value) && !/^\r|\r\n|\n$/.test(value)) {
              throw new Error('Invalid LineBreak token');
            }

            const tag = createTokenTag(type, { value });

            s.lastTag = tag;
            m.finalTag = s.lastTag;

            yield { type: sym.emit, value: tag };
          }

          m = m.terminate();

          s.match = null;
        } else {
          m.finalTag = s.lastTag;
        }

        m.capture();
      }

      m = m.terminate();

      if (m) {
        ({ s } = m);

        s.status = sym.active;
        m.co.advance(m.empty ? null : [m.startTag, m.finalTag]);
      } else {
        return;
      }
    }
  }
}
