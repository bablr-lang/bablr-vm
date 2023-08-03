import escapeRegex from 'escape-string-regexp';
import { exec, parse as parseRegex } from '@iter-tools/regex';

import { formatType } from './utils/format.js';
import { validateInstruction, shouldBranch } from './utils/instruction.js';
import { Match } from './match.js';
import { TagState } from './state.js';
import { Coroutine } from './coroutine.js';
import { Path } from './path.js';
import * as sym from './symbols.js';

const defer = Symbol('defer');

export function* dispatcher(ctx, rootSource, trampoline) {
  let m = null;
  let s = null;

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
          const { production } = matchable;
          const { type, attrs } = production;

          if (m) {
            m = m.push(m.exec(instr.value));
            ({ s } = m);
          } else {
            const gapTag = { type: 'GapTag', value: { type, attrs } };
            const path = Path.from(ctx, gapTag);
            const state = TagState.from(ctx, path, rootSource);
            m = Match.from(ctx, state, matchable);
            ({ s } = m);
          }

          s.status = sym.active;

          returnValue = m;
          break;
        }

        case sym.disambiguate: {
          const cases = instr.value;

          returnValue = null;

          // TODO integrate with regex to match all patterns at once
          for (let [matchable, pattern] of cases) {
            let result;
            switch (pattern.type) {
              case 'StringPattern': {
                const re = parseRegex(escapeRegex(pattern.value), 'y');
                [result] = exec(re, s.source);
                break;
              }
              case 'RegexPattern': {
                [result] = exec(parseRegex(pattern.value), s.source);
                break;
              }
            }

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

    if (m) {
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
    } else {
      return;
    }
  }
}
