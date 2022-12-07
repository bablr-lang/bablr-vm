export const { hasOwn, freeze, isFrozen, seal, isSealed } = Object;
export const { isArray } = Array;

export const get = (obj, path) => {
  let value = obj;
  for (const part of path.split('.')) {
    value = value[part];
  }
  return value;
};

const intFrom = (str) => {
  const value = parseInt(str, 10);
  return isNaN(value) ? null : value;
};

export const set = (obj, path, value) => {
  const parts = path.split('.');
  let obj_ = obj;

  let lastKey;
  for (let i = 0; i < parts.length; i++) {
    const intKey = intFrom(parts[i]);
    const key = intKey !== null ? intKey : parts[i];
    let value = obj_[key];

    if (parts.length - 1 === i) {
      lastKey = key;
    } else if (value !== undefined) {
      obj_ = value;
    } else if (intFrom(parts[i + 1]) !== null) {
      obj_ = value = obj_[key] = [];
    } else {
      throw new Error(`Unable to set {path: '${path}'} in obj`);
    }
  }

  obj_[lastKey] = value;
};

export const isSymbol = (obj) => typeof obj === 'symbol';
export const isString = (obj) => typeof obj === 'string';
export const isFunction = (obj) => typeof obj === 'function';

export function freezeSeal(obj) {
  let result = obj;
  if (!isFrozen) result = freeze(result);
  if (!isSealed) result = seal(result);
  return obj;
}
