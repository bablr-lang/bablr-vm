import { get } from '../utils/object.js';
import { facades } from '../utils/facades.js';
import { validateInstruction } from '../utils/instruction.js';
import { Path } from '../path.js';
import * as sym from '../symbols.js';
import { reject, rejected } from '../symbols.js';

export function* __match(context, state, production) {
  const ctx = context;
  const s = state;
  const grammar = ctx.grammars.get(sym.node);

  {
    const { property, type } = production;
    const resolvedProperty = s.resolver.resolve(property);
    const node = get(s.node, resolvedProperty);

    s.path = s.path.push(Path.from(ctx, node, resolvedProperty, type));
  }

  const co = production.value({
    context: facades.get(ctx),
    state: facades.get(s),
    path: facades.get(s.path),
    value: facades.get(production.value),
  });

  while (!co.done) {
    const instr = validateInstruction(co.value);

    let returnValue = undefined;

    switch (instr.type) {
      case sym.match: {
        const { matchable, effects } = instr.value;

        if (matchable.type === sym.node) {
          const { type, property } = matchable.production;
          const isNode = grammar.is('Node', type);

          if (isNode) {
            const resolvedProperty = s.resolver.resolve(property);
            const child = get(s.node, resolvedProperty);

            if (!child || !grammar.is(type, child.type)) {
              if (effects.failure === sym.reject) {
                yield { type: reject, value: undefined };
              }
              returnValue = null;
              break;
            }
          }

          // exec(instr, (type) => (path ? path.node.type : type));
          returnValue = yield instr;

          if (isNode) {
            s.resolver.consume(property);
          }
          break;
        }
        // fallthrough
      }

      default: {
        returnValue = yield instr;
        break;
      }
    }

    if (s.status !== rejected) {
      co.advance(returnValue);
    }
  }

  // const range = m.capture();
}
