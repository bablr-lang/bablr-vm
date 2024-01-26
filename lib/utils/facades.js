const { freeze } = Object;

const _facades = new WeakMap();

export const facades = {
  get(actual) {
    return actual == null ? actual : _facades.get(actual);
  },

  set(actual, facade) {
    if (_facades.has(actual) || _actuals.has(facade) || actual === facade) {
      throw new Error('facade mappings must be 1:1');
    }

    freeze(facade);

    _facades.set(actual, facade);
    _actuals.set(facade, actual);
  },
};

const _actuals = new WeakMap();

export const actuals = {
  get(facade) {
    return facade == null ? facade : _actuals.get(facade);
  },
};
