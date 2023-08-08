import { validateInstruction } from './utils/instruction.js';
import { emit, dispatch, terminate } from './utils/dispatcher.js';
import { tokenTag } from './utils/ast.js';
import * as sym from './symbols.js';
import { rejected } from './symbols.js';

const defer = Symbol('defer');

export function* parseTokens(ctx, rootMatch) {
  const grammar = ctx.grammars.get(sym.token);

  let m = rootMatch;
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
            // This logic is not occurring on the transition from node -> token
            //   how can I remedy this without copying?
            //     one way is how I *was* doing it (just one file)

            const { type, attrs } = matchable.value;
            const startSpan = attrs.get('startSpan');
            const endSpan = attrs.get('endSpan');
            const isToken = grammar.is('Token', type);

            if (s.match != null && isToken) {
              throw new Error('A token is already started');
            }

            if ((!isToken && startSpan) || endSpan) {
              throw new Error('Only tokens can start or end spans');
            }

            m = yield dispatch(instr.value);
            ({ s } = m);

            s.match = '';

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

    if (s.match) {
      if (/\r|\n/.test(s.match) && !/^\r|\r\n|\n$/.test(s.match)) {
        throw new Error('Invalid LineBreak token');
      }

      if (
        grammar.is('Token', m.matchable.value.type) &&
        !grammar.aliases.has(m.matchable.value.type)
      ) {
        yield emit(tokenTag(m.matchable.value.type, s.match));
      } else {
        throw new Error('b-b-b-b-bad');
      }
      s.match = null;
    }

    m = yield terminate();
  }
}
