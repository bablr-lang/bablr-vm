import { createTokenTag } from '../utils/token.js';
import { facades } from '../utils/facades.js';
import { validateInstruction } from '../utils/instruction.js';
import { Coroutine } from '../coroutine.js';
import * as sym from '../symbols.js';
import { match, rejected } from '../symbols.js';

const defer = Symbol('defer');

/**
 * Allows token grammar productions to call into other token grammar productions
 */
export function* exec(rootMatch) {
  const { ctx } = rootMatch;
  const grammar = ctx.grammars.get(sym.token);
  let m = rootMatch;
  let { s } = m;

  if (grammar.is('Token', rootMatch.production.type)) {
    if (s.match) {
      throw new Error('A token is already started');
    }

    s.match = { type: rootMatch.production.type, value: '' };
  }

  m.previousTag = s.lastTag;
  m.co = new Coroutine(
    grammar.get(m.production.type).match({
      context: facades.get(ctx),
      state: facades.get(s),
      attrs: m.production.attrs,
    }),
  );

  m.co.advance();

  for (;;) {
    while (!m.co.done) {
      const instr = validateInstruction(m.co.value);

      let returnValue = undefined;

      switch (instr.type) {
        case match: {
          const { matchable, effects } = instr.value;

          if (matchable.type === sym.token) {
            const { type, attrs } = matchable.production;
            const { startSpan, endSpan } = attrs;

            if (grammar.is('Token', type)) {
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

            m.previousTag = s.source.index;
            m.co = new Coroutine(
              grammar.get(type).match({
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

        default:
          returnValue = yield instr;
          break;
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
      const { startSpan, endSpan } = m.instruction;

      if (endSpan) {
        if (!s.source.done) {
          throw new Error();
        }

        s.spans = s.spans.pop();
      }

      if (!m.empty && startSpan) {
        s.spans = s.spans.push(startSpan);
      }

      if (grammar.is('Token', m.production.type)) {
        if (!s.match) throw new Error('No token is started');

        if (s.match.value) {
          const { type, value } = s.match;

          if (/\r|\n/.test(value) && !/^\r|\r\n|\n$/.test(value)) {
            throw new Error('Invalid LineBreak token');
          }

          const tag = createTokenTag(type, { value });

          ctx.prevTags.set(tag, s.lastTag);
          s.lastTag = tag;
          m.finalTag = s.lastTag;

          yield { type: sym.emit, value: tag };
        }

        m = m.terminate();

        s.match = null;
      } else {
        m.finalTag = s.lastTag;
      }

      if (m) {
        ({ s } = m);

        s.status = sym.active;
        m.co.advance(m.empty ? null : [m.previousTag, m.finalTag]);
      } else {
        s.status = sym.suspended;
        return rootMatch;
      }
    }
  }
}
