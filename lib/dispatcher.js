import { formatType } from './utils/format.js';
import { validateInstruction } from './utils/instruction.js';
import { Coroutine } from './coroutine.js';
import * as sym from './symbols.js';

export function* __run(rootMatch, source) {
  let m = rootMatch;

  for (;;) {
    while (!m.co.done) {
      const instr = validateInstruction(m.co.value);
      let returnValue = undefined;

      switch (instr.type) {
        case sym.match: {
          const { effects } = instr.value;
          const speculative = effects.success === sym.none || effects.failure === sym.none;

          const match = m.exec(instr);

          returnValue = noProgressLeftToRight ? null : match;

          if (!speculative && returnValue && effects.success === sym.reject) {
            m.terminate();
          }

          break;
        }

        case sym.accept:
          m = m.accept();
          break;

        case sym.reject:
          m = m.reject();
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

      m.co.advance(returnValue);
    }

    if (m.size === 1) {
      return;
    } else {
      m = m.pop();

      m.co.advance();
    }
  }
}

export function* runSync(match, engines) {
  let co = new Coroutine(__run(engines, match));

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

export async function* run(match, engines) {
  let co = new Coroutine(__run(engines, match));

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
