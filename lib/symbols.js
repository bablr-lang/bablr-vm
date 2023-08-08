export const _ = Symbol('_');

export const BOF = Symbol.for('cst-tokens/beginning-of-file');
export const EOF = Symbol.for('cst-tokens/end-of-file');

export const File = Symbol.for('cst-tokens/file');

export const Gap = Symbol.for('cst-tokens/gap');

export const match = Symbol.for('cst-tokens/match');
export const emit = Symbol.for('cst-tokens/emit');
export const resolve = Symbol.for('cst-tokens/resolve');
export const terminate = Symbol.for('cst-tokens/terminate');
export const disambiguate = Symbol.for('cst-tokens/disambiguate');
export const dispatch = Symbol.for('cst-tokens/dispatch');

export const none = Symbol.for('cst-tokens/none');
export const eat = Symbol.for('cst-tokens/eat');

export const node = Symbol.for('cst-tokens/node');
export const token = Symbol.for('cst-tokens/token');

export const accept = Symbol.for('cst-tokens/accpet');
export const reject = Symbol.for('cst-tokens/reject');

export const active = Symbol.for('cst-tokens/active');
export const suspended = Symbol.for('cst-tokens/suspended');
export const accepted = Symbol.for('cst-tokens/accepted');
export const rejected = Symbol.for('cst-tokens/rejected');
