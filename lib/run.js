import { formatType } from './utils/format.js';
import { getCooked } from './utils/token.js';
import { Coroutine } from './coroutine.js';

export function* runSync(dispatches) {
  let co = new Coroutine(dispatches);

  co.advance();

  while (!co.done) {
    const {
      verb: verbToken,
      arguments: {
        properties: { values: { 0: arg } = [] },
      },
    } = co.value.properties;

    const verb = getCooked(verbToken);

    switch (verb) {
      case 'resolve':
        throw new Error('runSync cannot resolve promises');

      case 'emit':
        yield arg;
        break;

      default:
        throw new Error(`Unexpected call {verb: ${formatType(verb)}}`);
    }

    co.advance(undefined);
  }
}

export async function* run(dispatches) {
  let co = new Coroutine(dispatches);

  co.advance();

  while (!co.done) {
    let returnValue;
    const {
      verb: verbToken,
      arguments: {
        properties: { values: { 0: arg } = [] },
      },
    } = co.value.properties;

    const verb = getCooked(verbToken);

    switch (verb) {
      case 'resolve':
        returnValue = await arg;
        break;

      case 'emit':
        yield arg;
        break;

      default:
        throw new Error();
    }

    co.advance(returnValue);
  }
}
