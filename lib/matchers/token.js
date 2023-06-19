import { isType } from '../utils/object.js';
import { createToken } from '../utils/token.js';
import { facades } from '../utils/facades.js';
import { validateInstruction } from '../utils/instruction.js';
import { Coroutine } from '../coroutine.js';
import * as sym from '../symbols.js';
import { match, rejected, startToken, endToken, startNode, endNode } from '../symbols.js';

export function* __match(context, state, production) {
  const ctx = context;
  const s = state;
  const grammar = ctx.grammars.get(sym.token);

  const co = new Coroutine(
    grammar.get(production.type).match({
      context: facades.get(ctx),
      state: facades.get(s),
      value: facades.get(production.value),
    }),
  );

  while (!co.done) {
    const instr = validateInstruction(co.value);

    let returnValue = undefined;

    switch (instr.type) {
      case match: {
        const { matchable, effects } = instr.value;

        if (matchable.type === sym.token) {
          const { type, startSpan, endSpan } = matchable.production;

          const isToken = grammar.is('Token', type);

          if (!isToken && (startSpan || endSpan)) {
            throw new Error();
          }

          if (endSpan) {
            if (!s.source.done) {
              throw new Error();
            }

            s.spans = s.spans.pop();
          }
        }

        returnValue = yield {
          type: sym.dispatch,
          value: {
            grammar: sym.token,
            matchable,
            effects,
          },
        };

        if (matchable.type === sym.token) {
          const { startSpan } = matchable.production;
          if (returnValue && startSpan) {
            s.spans = s.spans.push(startSpan);
          }
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

    if (s.status !== rejected) {
      co.advance(returnValue);
    }
  }
}
