import { active, accepted, rejected } from '../symbols.js';

export const finalizeStateStatus = (s, range) => {
  const finishedCo = s.co;

  if (s.status === active) {
    if (s.parent) {
      if (range) {
        s.accept();
      } else {
        s.reject();
      }
    } else {
      s.status = range ? accepted : rejected;
    }
  }

  let caught = true;
  try {
    finishedCo.throw('cleanup');
  } catch (e) {
    caught = false;
  }
  if (!caught && !finishedCo.done) {
    throw new Error('Generator attempted to yield a command after failing');
  }
};
