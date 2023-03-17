import { accepted, rejected } from '../symbols.js';

export const finalizeCoroutine = (s) => {
  const finishedCo = s.co;

  if (!finishedCo.done) {
    let caught = false;
    try {
      finishedCo.throw('failure');
    } catch (e) {
      caught = true;
    }
    if (!caught) {
      throw new Error('Generator attempted to yield a command after failing');
    }
  }
};
