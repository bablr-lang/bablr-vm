import * as sym from '../symbols.js';

export const emit = (value) => {
  return {
    type: sym.emit,
    value,
  };
};

export const terminate = (value) => {
  return {
    type: sym.terminate,
    value,
  };
};

export const dispatch = (value) => {
  return {
    type: sym.dispatch,
    value,
  };
};
