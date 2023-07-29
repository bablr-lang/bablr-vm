import { formatType } from './utils/format.js';
import { Coroutine } from './coroutine.js';
import * as sym from './symbols.js';

export function* runSync(dispatches) {
  let co = new Coroutine(dispatches);

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

export async function* run(dispatches) {
  let co = new Coroutine(dispatches);

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
