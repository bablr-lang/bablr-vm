import { isType } from '../utils/object.js';
import { createToken } from '../utils/token.js';
import { facades } from '../utils/facades.js';
import { validateInstruction } from '../utils/instruction.js';
import { Coroutine } from '../coroutine.js';
import * as sym from '../symbols.js';
import { match, rejected, startToken, endToken, startNode, endNode } from '../symbols.js';

const defer = Symbol('defer');

/**
 * Allows token grammar productions to call into other token grammar productions
 */
export function* exec(rootMatch) {
  const { ctx } = rootMatch;
  const grammar = ctx.grammars.get(sym.token);
  let m = rootMatch;
  let { s } = m;

  m.co = new Coroutine(
    grammar.get(m.production.type).match({
      context: facades.get(ctx),
      state: facades.get(s),
      value: m.production.value,
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
            const { type, startSpan, endSpan, value } = matchable.production;

            if (!grammar.is('Token', type) && (startSpan || endSpan)) {
              throw new Error();
            }

            m = m.exec(instr.value);
            ({ s } = m);

            m.co = new Coroutine(
              grammar.get(type).match({
                context: facades.get(ctx),
                state: facades.get(s),
                value,
              }),
            );
          } else if ((matchable.type = sym.character)) {
            const result = yield instr;

            if (result) {
              if (effects.success === sym.eat) {
                s.match += result;
                m.source.advance(result.length);
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

        case startToken: {
          if (s.match) {
            throw new Error('A token is already started');
          }

          const type = instr.value;

          if (!isType(type)) throw new Error();

          s.match = { type, value: '' };

          returnValue = undefined;
          break;
        }

        case endToken: {
          if (instr.value !== undefined) throw new Error();

          if (!s.match) throw new Error('No token is started');

          const { type, value } = s.match;

          if (!value) throw new Error('Invalid token');

          if (/\r|\n/.test(value) && !/^\r|\r\n|\n$/.test(value)) {
            throw new Error('Invalid LineBreak token');
          }

          const token = createToken(type, value);

          ctx.prevTokens.set(token, s.lastToken);
          s.lastToken = token;
          s.match = null;

          returnValue = token;
          break;
        }

        case startNode: {
          throw new Error();
        }

        case endNode: {
          throw new Error();
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
      const range = m.capture();
      const { startSpan, endSpan } = m.instruction;

      if (endSpan) {
        if (!s.source.done) {
          throw new Error();
        }

        s.spans = s.spans.pop();
      }

      if (range && startSpan) {
        s.spans = s.spans.push(startSpan);
      }

      m = m.terminate();

      if (m) {
        ({ s } = m);

        s.status = sym.active;
        m.co.advance(range);
      } else {
        s.status = sym.suspended;
        s.match = null;
        return;
      }
    }
  }
}
