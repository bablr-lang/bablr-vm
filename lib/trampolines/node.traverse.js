import { get } from '../utils/object.js';
import { facades } from '../utils/facades.js';
import { validateInstruction, shouldBranch } from '../utils/instruction.js';
import { Path } from '../path.js';
import { Match } from '../match.js';
import { Coroutine } from '../coroutine.js';
import * as sym from '../symbols.js';
import { reject, rejected } from '../symbols.js';

const defer = Symbol('defer');

export const buildTraversalTrampoline = (ast) => {
  return (context, state, production) => {
    const ctx = context;
    const s = state;
    const grammar = ctx.grammars.get(sym.node);

    let resolvedType = production.type;
    if (grammar.is('Node', ast.type) && !grammar.aliases.has(ast.type)) {
      if (!grammar.is(production.type, ast.type)) {
        throw new Error('I should probably handle this');
      }

      resolvedType = ast.type;
    }

    return __trampoline(
      Match.from(
        context,
        state,
        production,
        new Coroutine(
          grammar.get(resolvedType).match({
            context: facades.get(ctx),
            state: facades.get(s),
            path: facades.get(s.path),
            value: production.value,
          }),
        ),
      ),
    );
  };
};

/**
 * Allows node grammar productions to call into other node grammar productions
 */
function* __trampoline(rootMatch) {
  const { ctx } = rootMatch;
  const grammar = ctx.grammars.get(sym.node);
  let m = rootMatch;
  let { s } = m;

  for (;;) {
    while (!m.s.co.done) {
      const instr = validateInstruction(m.s.co.value);

      let returnValue = undefined;

      switch (instr.type) {
        case sym.match: {
          const { effects, matchable } = instr.value;

          if (matchable.type === sym.node) {
            const { production } = matchable;
            const { property, type, value } = production;
            let resolvedType = type;

            if (grammar.is('Node', type)) {
              const resolvedProperty = s.resolver.resolve(property);
              const child = get(s.node, resolvedProperty);

              if (!child || !grammar.is(type, child.type)) {
                if (effects.failure === sym.reject) {
                  yield { type: reject, value: undefined };
                }
                returnValue = null;
                break;
              }

              resolvedType = child.type;

              s = shouldBranch(effects) ? s.branch() : s;

              s.path = s.path.push(Path.from(ctx, child, resolvedProperty, type));
            } else {
              s = shouldBranch(effects) ? s.branch() : s;
            }

            m = m.push(
              new Match(
                ctx,
                s,
                instr.value,
                new Coroutine(
                  grammar.get(resolvedType).match({
                    context: facades.get(ctx),
                    state: facades.get(s),
                    path: facades.get(s.path),
                    value,
                  }),
                ),
              ),
            );

            returnValue = defer;
            break;
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
      } else if (!m.s.co.done) {
        m.s.co.advance(returnValue);
      }
    }

    // resume suspended execution

    {
      const range = m.capture();
      const { production } = m;

      if (grammar.is('Node', production.type)) {
        s.resolver.consume(production.property);
      }

      m = m.terminate();

      if (m) {
        const wasSpeculative = s.speculative;
        ({ s } = m);

        if (range && wasSpeculative && !s.speculative) {
          // How do we know what the last token we emitted was?
          yield* [...ctx.allTokensFor(range)].reverse();
        }

        s.status = sym.active;
        m.s.co.advance(range);
      } else {
        return;
      }
    }
  }
}
