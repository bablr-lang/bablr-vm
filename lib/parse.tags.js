import { validateInstruction } from './utils/instruction.js';
import { emit, dispatch, init, terminate } from './utils/dispatcher.js';
import { openTag, closeTag } from './utils/ast.js';
import { parseTokens } from './parse.tokens.js';
import * as sym from './symbols.js';

const defer = Symbol('defer');

export function* parseTags(ctx) {
  const grammar = ctx.grammars.get(sym.node);

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

          if (matchable.type === 'GapTag') {
            const { type, attrs } = matchable.value;
            const segment = attrs.get('path') || null;

            if (grammar.is('Node', type)) {
              if (s.path.depth && !segment) throw new Error('segment is missing');

              if (!grammar.aliases.has(type)) {
                const tag = openTag(s.path.isGap ? s.gapType : type, type, attrs);

                s.path = s.path.pushTag(tag);
              }
            }

            m = yield dispatch(instr.value);
            ({ s } = m);

            m.co.advance();

            returnValue = defer;
            break;
          } else if (matchable.type === 'TokenTag') {
            yield* parseTokens(ctx);

            break;
          }
          // fallthrough
        }

        default: {
          returnValue = yield instr;
          break;
        }
      }

      if (s.status === sym.rejected) {
        break;
      }

      if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!m.co.done) {
        m.co.advance(returnValue);
      }
    }

    // resume suspended execution

    if (!m.empty && m.grammar.is('Node', m.type)) {
      yield emit(closeTag(m.matchable.value.type));
    }

    m = yield terminate();
  }
}
