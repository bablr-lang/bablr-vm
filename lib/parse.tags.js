import { validateInstruction } from './utils/instruction.js';
import { emit, dispatch, terminate } from './utils/dispatcher.js';
import { openTag, closeTag } from './utils/ast.js';
import { parseTokens } from './parse.tokens.js';
import * as sym from './symbols.js';

const defer = Symbol('defer');

export function* parseTags(ctx, rootMatch) {
  const grammar = ctx.grammars.get(sym.node);

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

          if (matchable.type === 'GapTag') {
            const { type, attrs } = matchable.value;
            const segment = attrs.get('path') || null;

            if (grammar.is('Node', type)) {
              if (s.path.depth && !segment) throw new Error('segment is missing');

              if (!grammar.aliases.has(type)) {
                const tag = openTag(s.path.isGap ? s.path.gapType : type, type, attrs);

                yield emit(tag);

                s.path = s.path.pushTag(tag);
              }
            }

            m = yield dispatch(instr.value);
            ({ s } = m);

            m.co.advance();

            returnValue = defer;
            break;
          } else if (matchable.type === 'TokenTag') {
            m = yield dispatch(instr.value);

            yield* parseTokens(ctx, m);

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

    if (
      s.result.type !== 'OpenTag' &&
      grammar.is('Node', m.matchable.value.type) &&
      !grammar.aliases.has(m.matchable.value.type)
    ) {
      yield emit(closeTag(m.matchable.value.type));
    }

    m = yield terminate();
  }
}
