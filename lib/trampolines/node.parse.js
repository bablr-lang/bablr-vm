import { facades } from '../utils/facades.js';
import { validateInstruction, shouldBranch } from '../utils/instruction.js';
import { Match } from '../match.js';
import { Path } from '../path.js';
import { Element } from '../element.js';
import { Tag } from '../tag.js';
import { Coroutine } from '../coroutine.js';
import * as sym from '../symbols.js';
import { rejected } from '../symbols.js';

const defer = Symbol('defer');

const emit = (value) => {
  return {
    type: sym.emit,
    value,
  };
};

/**
 * Allows node grammar productions to call into other node grammar productions
 */
export function* exec(rootMatch) {
  const { ctx } = rootMatch;
  const grammar = ctx.grammars.get(sym.node);
  let m = rootMatch;
  let { s } = m;

  m.co = new Coroutine(
    grammar.get(m.production.type).match({
      context: facades.get(ctx),
      state: facades.get(s),
      path: facades.get(s.path),
      attrs: m.production.attrs,
    }),
  );

  m.co.advance();

  if (grammar.is('Node', m.production.type)) {
    if (!shouldBranch(m.effects)) {
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

            if (grammar.is('Node', type)) {
              s = shouldBranch(effects) ? s.branch() : s;

              if (s.path.depth && !segment) throw new Error('segment is missing');

              if (grammar.aliases.has(type)) {
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

            m = m.push(new Match(ctx, s, instr.value));
            m.co = new Coroutine(
              grammar.get(type).match({
                context: facades.get(ctx),
                state: facades.get(s),
                path: facades.get(s.path),
                attrs,
              }),
            );

            m.co.advance();

            returnValue = defer;
          } else if (matchable.type === sym.token) {
            if (s.path.isGap && effects.success === sym.eat) {
              throw new Error('Cannot eat tokens outside of a node');
            }
            returnValue = yield instr;
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
      m.endTag = s.startTag;
      const completedMatch = m;

      m = m.terminate();

      if (m) {
        const wasSpeculative = s.speculative;
        ({ s } = m);

        if (!m.empty && !s.speculative) {
          if (wasSpeculative) {
            throw new Error('not ready yet');
            yield* [...ctx.allTokensFor(completedMatch.range)]
              .reverse()
              .map((value) => ({ type: sym.emit, value }));
          }

          yield emit({
            type: 'CloseTag',
            value: { type: completedMatch.production.type },
          });
        }

        s.status = sym.active;
        m.co.advance(m.empty ? null : [m.startTag, m.endTag]);
      } else {
        return;
      }
    }
  }
}
