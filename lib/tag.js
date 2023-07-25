import { _ } from './symbols.js';

export class Tag {
  static from(type, gapType, attrs) {
    return new Tag(type, gapType, attrs);
  }

  constructor(type, gapType, attrs = {}) {
    if (!type && !gapType) throw new Error('A node must have a type or a gapType');

    this[_] = {
      type,
      gapType,
      attrs,
      properties: {},
    };
  }

  get isGap() {
    return !!this[_].type;
  }

  get type() {
    return this[_].type;
  }

  get gapType() {
    return this[_].gapType;
  }

  get attrs() {
    return this[_].attrs;
  }

  get properties() {
    return this[_].properties;
  }
}
