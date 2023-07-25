import { facades, actuals } from './utils/facades.js';
import { ownChildrenFor, allChildrenFor } from './utils/token.js';
import { _ } from './symbols.js';

export class ElementFacade {
  constructor(path) {
    facades.set(path, this);
  }

  get type() {
    return actuals.get(this).type;
  }

  get isGap() {
    return actuals.get(this).isGap;
  }

  get gapType() {
    return actuals.get(this).gapType;
  }

  getAttr(key) {
    return actuals.get(this).attrs[key];
  }

  ownChildren() {
    return actuals.get(this).ownChildren();
  }

  allChildren() {
    return actuals.get(this).allChildren();
  }
}

export class Element {
  static from(openTag) {
    return new Element(openTag);
  }

  constructor(openTag) {
    if (!openTag) throw new Error('openTag is required');

    this[_] = {
      openTag,
      closeTag: openTag.isGap ? openTag : null,
    };

    new ElementFacade(this);
  }

  get openTag() {
    return this[_].openTag;
  }

  get closeTag() {
    return this[_].closeTag;
  }

  get isGap() {
    return this.openTag.isGap;
  }

  get type() {
    return this[_].openTag.type;
  }

  get gapType() {
    return this[_].openTag.gapType;
  }

  get attrs() {
    return this[_].openTag.attrs;
  }

  set closeTag(value) {
    if (this.closeTag) throw new Error('Cannot overwrite closeTag');

    this[_].lastChild = value;
  }

  *ownChildren() {
    return ownChildrenFor([this.firstChild, this.lastChild]);
  }

  *allChildren() {
    return allChildrenFor([this.firstChild, this.lastChild]);
  }
}
