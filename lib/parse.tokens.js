import { validateInstruction } from './utils/instruction.js';
import { emit, dispatch, init, terminate } from './utils/dispatcher.js';
import { tokenTag } from './utils/ast.js';
import * as sym from './symbols.js';
import { rejected } from './symbols.js';

const defer = Symbol('defer');

export function* parseTokens(ctx) {
  const grammar = ctx.grammars.get(sym.token);

  let m = yield init();
  let { s } = m;

  m.co.advance();

  while (m) {
    while (!m.co.done) {
      const instr = validateInstruction(m.co.value);

      let returnValue = undefined;

      switch (instr.type) {
        case sym.match: {
          const { matchable } = instr.value;

          if (matchable.type === 'TokenTag') {
            const { type, attrs } = matchable.value;
            const startSpan = attrs.get('startSpan');
            const endSpan = attrs.get('endSpan');
            const isToken = grammar.is('Token', type);

            if (s.match && isToken) {
              throw new Error('A token is already started');
            }

            if ((!isToken && startSpan) || endSpan) {
              throw new Error('Only tokens can start or end spans');
            }

            m = yield dispatch(instr.value);
            ({ s } = m);

            s.match = { type, value: '' };

            m.co.advance();

            returnValue = defer;
            break;
          }
          // fallthrough
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

    const { type, value } = s.match;

    s.match = null;

    if (value) {
      if (/\r|\n/.test(value) && !/^\r|\r\n|\n$/.test(value)) {
        throw new Error('Invalid LineBreak token');
      }

      if (m.grammar.is('Token', m.matchable.value.type)) {
        yield emit(tokenTag(type, value));
      } else {
        throw new Error('b-b-b-b-bad');
      }
    }

    m = yield terminate();
  }
}
