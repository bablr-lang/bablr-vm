import { formatType } from './utils/format.js';
import { freezeSeal, isType } from './utils/object.js';
import { Coroutine } from './coroutine.js';
import * as sym from './symbols.js';

export function* __run(engines, rootMatch) {
  // let m = rootMatch;

  for (;;) {
    while (!m.co.done) {
      const instr = validateInstruction(m.co.value);
      let result = undefined;

      switch (instr.type) {
        case sym.resolve:
        case sym.emit:
          result = yield instr;
          break;

        case sym.accept:
          m = m.accept();
          break;

        case sym.reject:
          m = m.reject();
          break;

        case sym.match: {
          const matchInstruction = instr.value;

          const { matchable, effects } = matchInstruction;

          const speculative = effects.success === sym.none || effects.failure === sym.none;

          if (!isType(matchable.type)) {
            throw new Error(`matchable.type must be a type`);
          }

          const engine_ = engines.get(matchable.type);
          const engine = speculative ? engine_.branch() : engine_; // coroutine never branches

          const result = engine.exec(instr);

          if (!speculative && result && effects.success === sym.reject) {
            m.terminate();
          }

          result = null;
          break;
        }
        default:
          throw new Error(`Unexpected instruction of {type: ${formatType(instr.type)}}`);
      }

      e.co.advance(result);
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
    let result = undefined;

    switch (instr.type) {
      case sym.resolve:
        result = await instr.value;
        break;
      case sym.emit:
        yield instr.value;
        break;
      default:
        throw new Error();
    }

    co.advance(result);
  }
}
