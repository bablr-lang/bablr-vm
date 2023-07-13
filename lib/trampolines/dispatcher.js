import escapeRegex from 'escape-string-regexp';
import { exec, parse as parseRegex } from '@iter-tools/regex';

import { assertValidRegex } from '../utils/token.js';
import { isString } from '../utils/object.js';
import { formatType } from '../utils/format.js';
import { validateInstruction } from '../utils/instruction.js';
import { Match } from '../match.js';
import { Coroutine } from '../coroutine.js';
import * as sym from '../symbols.js';

const defer = Symbol('defer');

/**
 * Allows trampolines to call between each other
 */
function* __dispatcher(trampolines, rootMatch) {
  const { ctx } = rootMatch;
  let m = rootMatch;

  m.co = new Coroutine(
    trampolines.get(m.grammar)(Match.from(ctx, m.state.get(m.grammar), m.source, m.matchable)),
  );

  m.co.advance();

  for (;;) {
    while (!m.co.done) {
      const instr = validateInstruction(m.co.value);
      let returnValue = undefined;

      switch (instr.type) {
        case sym.match: {
          const { effects, matchable } = instr.value;
          const { type } = matchable;

          if (type === sym.character) {
            let pattern = matchable.production; // clumsy

            if (isString(pattern)) {
              pattern = new RegExp(escapeRegex(pattern), 'y');
            }

            assertValidRegex(pattern);

            const [result] = exec(parseRegex(pattern), m.source);

            returnValue = result ? result : null;
          } else {
            const trampoline = trampolines.get(type);

            m = m.exec(instr.value);
            m.co = new Coroutine(
              trampoline(Match.from(ctx, m.state.get(type), m.source, matchable)),
            );

            returnValue = defer;
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

        case sym.emit:
          yield instr;
          break;

        default:
          throw new Error(`Unexpected instruction of {type: ${formatType(instr.type)}}`);
      }

      if (m.s.status === sym.rejected) {
        break;
      }

      if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!m.co.done) {
        m.co.advance(returnValue);
      }
    }

    if (m.size === 1) {
      return;
    } else {
      const completedMatch = m;

      m = m.parent;

      const { effects } = m;
      const returnValue = completedMatch.empty ? null : completedMatch;

      if (returnValue && effects.success === sym.reject) {
        m.terminate();
      }

      m.co.advance(returnValue);
    }
  }
}

export function* runSync(trampolines, match) {
  let co = new Coroutine(__dispatcher(trampolines, match));

  co.advance();

  while (!co.done) {
    let { value: instr } = co;

    switch (instr.type) {
      case sym.resolve:
        throw new Error('runSync cannot resolve promises');
      case sym.emit:
        yield instr.value;
        break;
      default:
        throw new Error(`Unexpected instruction of {type: ${formatType(instr.type)}}`);
    }

    co.advance(undefined);
  }
}

export async function* run(trampolines, match) {
  let co = new Coroutine(__dispatcher(trampolines, match));

  co.advance();

  while (!co.done) {
    let { value: instr } = co;
    let returnValue = undefined;

    switch (instr.type) {
      case sym.resolve:
        returnValue = await instr.value;
        break;
      case sym.emit:
        yield instr.value;
        break;
      default:
        throw new Error();
    }

    co.advance(returnValue);
  }
}
