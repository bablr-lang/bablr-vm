export const { hasOwn, freeze, isFrozen, seal, isSealed } = Object;
export const { isArray } = Array;

const intFrom = (str) => {
  const value = parseInt(str, 10);
  return isNaN(value) ? null : value;
};

export const has = (obj, property) => {
  let value = obj;
  for (const part of property.split('.')) {
    if (!hasOwn(value, part)) return false;
    value = value[part];
  }
  return true;
};

export const get = (obj, property) => {
  let value = obj;
  for (const part of property.split('.')) {
    value = value[part];
  }
  return value;
};

export const set = (obj, property, value) => {
  const parts = property.split('.');
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
      throw new Error(`Unable to set {property: '${property}'} in obj`);
    }
  }

  obj_[lastKey] = value;
};

export const isFunction = (obj) => typeof obj === 'function';
export const isSymbol = (obj) => typeof obj === 'symbol';
export const isString = (obj) => typeof obj === 'string';
export const isType = (obj) => isSymbol(obj) || isString(obj);

export function freezeSeal(obj) {
  let result = obj;
  if (!isFrozen) result = freeze(result);
  if (!isSealed) result = seal(result);
  return obj;
}
