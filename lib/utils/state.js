import { active, accepted, rejected } from '../symbols.js';

export const finalizeStatus = (s) => {
  if (s.status === active) {
    if (s.parent) {
      if (s.co.done) {
        s.accept();
      } else {
        s.reject();
      }
    } else {
      s.status = s.co.done ? accepted : rejected;
    }
  }
};

export const finalizeCoroutine = (s) => {
  const finishedCo = s.co;

  if (s.status !== accepted && s.status !== rejected) throw new Error();

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
