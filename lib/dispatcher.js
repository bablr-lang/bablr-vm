import { formatType } from './utils/format.js';
import { validateInstruction } from './utils/instruction.js';
import { Match } from './match.js';
import { Coroutine } from './coroutine.js';
import * as sym from './symbols.js';

const defer = Symbol('defer');

export function* __run(matchers, rootMatch, source) {
  let m = rootMatch;

  for (;;) {
    while (!m.co.done) {
      const instr = validateInstruction(m.co.value);
      let returnValue = undefined;

      switch (instr.type) {
        case sym.match: {
          const { state, ctx } = m;
          const { effects, matchable } = instr.value;
          const { type } = matchable;
          const speculative = effects.success === sym.none || effects.failure === sym.none;

          let nextState = state;

          if (speculative) {
            nextState = new Map(state);
            nextState.set(type, state.get(type).branch());
          }

          m = m.push(new Match(matchers, ctx, nextState, instr.value));

          returnValue = defer;
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

      if (matchStatus === sym.rejected) {
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

      m = m.pop();

      const { effects } = m;
      const returnValue = noProgressLeftToRight ? null : completedMatch;

      if (returnValue && effects.success === sym.reject) {
        m.terminate();
      }

      m.co.advance(returnValue);
    }
  }
}

export function* runSync(matchers, match, source) {
  let co = new Coroutine(__run(matchers, match, source));

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

export async function* run(matchers, match, source) {
  let co = new Coroutine(__run(matchers, match, source));

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
