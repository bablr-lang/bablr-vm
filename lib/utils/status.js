import { active, accepted, rejected } from '../symbols.js';

export const finalizeStateStatus = (s) => {
  if (s.status === active) {
    if (s.parent) {
      if (s.match) {
        s.accept();
      } else {
        s.reject();
      }
    } else {
      s.status = s.match ? accepted : rejected;
    }
  }
};
