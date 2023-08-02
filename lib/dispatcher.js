import escapeRegex from 'escape-string-regexp';
import { exec, parse as parseRegex } from '@iter-tools/regex';

import { isString } from './utils/object.js';
import { formatType } from './utils/format.js';
import { validateInstruction, shouldBranch, buildProps } from './utils/instruction.js';
import { Match } from './match.js';
import { Coroutine } from './coroutine.js';
import { Path } from './path.js';
import * as sym from './symbols.js';

const defer = Symbol('defer');

/**
 * Allows trampolines to call between each other
 */
export function* dispatcher(ctx, initialState, trampoline) {
  let m = null;
  let s = initialState;

  let co = new Coroutine(trampoline);

  co.advance();

  for (;;) {
    while (!co.done) {
      const instr = validateInstruction(co.value);
      let returnValue = undefined;

      switch (instr.type) {
        // Creates a stack frame, also known as a match
        case sym.dispatch: {
          const { matchable } = instr.value;
          const { type: grammarType, production } = matchable;
          const grammar = ctx.grammars.get(grammarType);
          const { type, attrs } = production;

          if (m) {
            m = m.push(m.exec(instr.value));
            ({ s } = m);
          } else {
            const gapTag = { type: 'GapTag', type, attrs };
            const path = Path.from(ctx, gapTag);

            m = Match.from(ctx, s, matchable);
            ({ s } = m);
            // co = new Coroutine(trampoline);
          }

          returnValue = m;
          break;
        }

        case sym.disambiguate: {
          const cases = instr.value;

          returnValue = null;

          // TODO integrate with regex to match all patterns at once
          for (let [matchable, pattern] of cases) {
            if (isString(pattern)) {
              pattern = new RegExp(escapeRegex(pattern), 'y');
            }

            const [result] = exec(parseRegex(pattern), m.state.get(sym.token).source);

            if (result) {
              returnValue = matchable;
              break;
            }
          }

          break;
        }

        case sym.reject:
          m.reject();
          returnValue = null;
          break;

        case sym.resolve:
          returnValue = yield instr;
          break;

        case sym.emit: {
          const { prevTags } = ctx;
          const tag = instr.value;
          let { lastTag } = m;

          prevTags.set(tag, lastTag);

          m.lastTag = lastTag = tag;

          yield instr;
          break;
        }

        default:
          throw new Error(`Unexpected instruction of {type: ${formatType(instr.type)}}`);
      }

      if (m.s.status === sym.rejected) {
        break;
      }

      if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!co.done) {
        co.advance(returnValue);
      }
    }

    if (m.size === 1) return;

    const completedMatch = m;

    m = m.parent;
    ({ s } = m);

    const { effects } = m;
    const returnValue = completedMatch.empty ? null : completedMatch;

    // do I still need this?
    if (returnValue && effects.success === sym.reject) {
      m.terminate();
    }

    if (
      returnValue &&
      shouldBranch(completedMatch.effects) &&
      completedMatch.effects.success === sym.eat
    ) {
      m.state.states
        .get(completedMatch.grammar)
        .accept(completedMatch.state.get(completedMatch.grammar));
    } else if (!returnValue && completedMatch.effects.success === sym.reject) {
      // TODO
    }

    co.advance(returnValue);
  }
}
