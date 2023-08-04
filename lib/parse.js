import { facades } from './utils/facades.js';
import { validateInstruction, shouldBranch, buildProps } from './utils/instruction.js';
import { createTokenTag } from './utils/token.js';
import { emit, dispatch, init } from './utils/shorthand.js';
import { Coroutine } from './coroutine.js';
import { Context } from './context.js';
import { Source } from './source.js';
import { runSync } from './run.js';
import { dispatcher } from './dispatcher.js';
import * as sym from './symbols.js';
import { rejected } from './symbols.js';

const defer = Symbol('defer');

export function parse(language, sourceText, gapType, attrs = new Map()) {
  const ctx = Context.from(language);
  const source = Source.from(ctx, sourceText);
  const matchable = { type: 'GapTag', value: { type: gapType, attrs } };

  return runSync(dispatcher(ctx, source, matchable, __parse(ctx)));
}

export function* __parse(ctx) {
  const nodeGrammar = ctx.grammars.get(sym.node);
  const tokenGrammar = ctx.grammars.get(sym.token);

  let m = yield init();
  let { s } = m;

  m.co.advance();

  m.precedingTag = s.lastTag;

  for (;;) {
    while (!m.co.done) {
      const instr = validateInstruction(m.co.value);

      let returnValue = undefined;

      switch (instr.type) {
        case sym.match: {
          const { effects, matchable } = instr.value;

          if (matchable.type === 'GapTag') {
            const { type, attrs } = matchable.value;
            const segment = attrs.get('path');

            if (nodeGrammar.is('Node', type)) {
              s = shouldBranch(effects) ? s.branch() : s;

              if (s.path.depth && !segment) throw new Error('segment is missing');

              if (!nodeGrammar.aliases.has(type)) {
                const openTag = {
                  type: 'OpenTag',
                  gapType: s.path.isGap ? s.gapType : type,
                  value: { type, attrs },
                };

                s.path = s.path.pushTag(openTag);

                if (!shouldBranch(effects)) {
                  yield emit(openTag);
                }
              }
            } else {
              s = shouldBranch(effects) ? s.branch() : s;
            }

            m = yield dispatch(instr.value);
            ({ s } = m);

            m.co.advance();

            returnValue = defer;
          } else if (matchable.type === 'TokenTag') {
            // if (s.path.isGap && effects.success === sym.eat) {
            //   throw new Error('Cannot eat tokens outside of a node');
            // }

            const { type, attrs } = matchable.value;
            const startSpan = attrs.get('startSpan');
            const endSpan = attrs.get('endSpan');

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

            m = yield dispatch(instr.value);
            ({ s } = m);

            m.co.advance();

            returnValue = defer;
          } else if (matchable.type === 'StringPattern' || matchable.type === 'RegexPattern') {
            if (!s.match && effects.success === sym.eat) {
              throw new Error('Grammar must not eat characters outside a token');
            }

            // match-y match match

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
            throw new Error(`Unkown matchable of {type: ${matchable.type}}`);
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
            value: { type: completedMatch.tag.type },
          };

          m.finalTag = finalTag;

          if (!s.speculative) {
            yield emit(finalTag);
          }
        } else if (tokenGrammar.is('Token', m.tag.type)) {
          if (!s.match) throw new Error('No token is started');

          if (s.match.value) {
            const { type, value } = s.match;

            if (/\r|\n/.test(value) && !/^\r|\r\n|\n$/.test(value)) {
              throw new Error('Invalid LineBreak token');
            }

            const tag = createTokenTag(type, { value });

            s.lastTag = tag;
            m.finalTag = s.lastTag;

            yield emit(tag);
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
