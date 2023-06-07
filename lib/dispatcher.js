import { formatType } from './utils/format.js';
import { Engine } from './engine.js';
import { Coroutine } from './coroutine.js';
import * as sym from './symbols.js';

export function* __run(rootEngine) {
  const { ctx } = rootEngine;
  let e = rootEngine;

  for (;;) {
    while (!e.co.done) {
      let { value: instr } = e.co;
      let result = undefined;

      switch (instr.type) {
        case sym.resolve:
        case sym.emit:
          result = yield instr;
          break;
        case sym.match:
          e = e.push(ctx.grammars.get(instr.value.matchable.grammar));
          result = null;
          break;
        default:
          throw new Error(`Unexpected instruction of {type: ${formatType(instr.type)}}`);
      }

      e.co.advance(result);
    }

    if (e.size === 1) {
      return;
    } else {
      e = e.pop();

      e.co.advance();
    }
  }
}

export function* runSync(context, match, engineGen) {
  let co = new Coroutine(__run(Engine.from(context, match, engineGen)));

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

export async function* run(context, match, engineCo) {
  let co = new Coroutine(__run(Engine.from(context, match, engineCo)));

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
