import * as sym from '../symbols.js';

export const init = (value) => {
  return {
    type: sym.init,
    value,
  };
};

export const emit = (value) => {
  return {
    type: sym.emit,
    value,
  };
};

export const dispatch = (value) => {
  return {
    type: sym.dispatch,
    value,
  };
};
