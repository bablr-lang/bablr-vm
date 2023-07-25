export const { hasOwn, freeze, isFrozen, seal, isSealed, getOwnPropertySymbols } = Object;
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

export function objectKeys(obj) {
  return {
    *[Symbol.iterator]() {
      for (let key in obj) if (hasOwn(obj, key)) yield key;
      yield* getOwnPropertySymbols(obj);
    },
  };
}

export function objectValues(obj) {
  return {
    *[Symbol.iterator]() {
      for (let key in obj) if (hasOwn(obj, key)) yield obj[key];
      yield* getOwnPropertySymbols(obj).map((sym) => obj[sym]);
    },
  };
}

export function objectEntries(obj) {
  return {
    *[Symbol.iterator]() {
      for (let key in obj) if (hasOwn(obj, key)) yield [key, obj[key]];
      yield* getOwnPropertySymbols(obj).map((sym) => [sym, obj[sym]]);
    },
  };
}

export const isObject = (obj) => obj !== null && typeof obj === 'object';
export const isFunction = (obj) => typeof obj === 'function';
export const isSymbol = (obj) => typeof obj === 'symbol';
export const isString = (obj) => typeof obj === 'string';
export const isType = (obj) => isSymbol(obj) || isString(obj);
export const isRegex = (obj) => obj instanceof RegExp;
export const isPattern = (obj) => isString(obj) || isRegex(obj);

export function freezeSeal(obj) {
  return freeze(seal(obj));
}

export class WeakStack {
  constructor() {
    this.parents = new WeakMap();
    this.depths = new WeakMap();
  }

  push(current, next) {
    if (this.parents.has(next)) throw new Error('oh no!');

    this.parents.set(next, current);
    this.depths.set(next, this.depth(current) + (current ? 1 : 0));
    return next;
  }

  parent(current) {
    return this.parents.get(current);
  }

  depth(current) {
    return this.depths.get(current) || 0;
  }
}

export class WeakStackFrame {
  get stack() {
    throw new Error('abstract getter');
  }

  push(frame) {
    if (!(frame instanceof WeakStackFrame)) throw new Error();
    return this.stack.push(this, frame);
  }

  replace(frame) {
    if (!(frame instanceof WeakStackFrame)) throw new Error();
    if (this.parent) {
      return this.parent.push(frame);
    } else {
      this.stack.push(null, frame);
      return frame;
    }
  }

  get parent() {
    return this.stack.parent(this);
  }

  get depth() {
    return this.stack.depth(this);
  }

  *ancestors(includeSelf) {
    let ancestor = this;

    if (includeSelf) yield ancestor;

    while ((ancestor = ancestor.parent)) {
      yield ancestor;
    }
  }
}
