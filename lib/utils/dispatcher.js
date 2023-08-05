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

export const accept = (value) => {
  return {
    type: sym.accept,
    value,
  };
};

export const reject = (value) => {
  return {
    type: sym.reject,
    value,
  };
};

export const dispatch = (value) => {
  return {
    type: sym.dispatch,
    value,
  };
};
