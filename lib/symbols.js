export const _ = Symbol('_');
export const _actual = Symbol('_actual');

export const none = Symbol('none');
export const defer = Symbol('defer');

export const up = Symbol('up');
export const down = Symbol('down');

export const EOF = Symbol.for('cst-tokens/end-of-file');
export const LexicalBoundary = Symbol.for('cst-tokens/lexical-boundary');

export const File = Symbol.for('cst-tokens/file');
export const Fragment = Symbol.for('cst-tokens/fragment');

export const Gap = Symbol.for('cst-tokens/gap');

export const StartNode = Symbol.for('cst-tokens/start-node');
export const EndNode = Symbol.for('cst-tokens/end-node');

export const startToken = Symbol.for('cst-tokens/start-token');
export const endToken = Symbol.for('cst-tokens/end-token');

export const eat = Symbol.for('cst-tokens/eat');
export const match = Symbol.for('cst-tokens/match');
export const eatMatch = Symbol.for('cst-tokens/eat-match');

export const node = Symbol.for('cst-tokens/node');
export const token = Symbol.for('cst-tokens/token');
export const character = Symbol.for('cst-tokens/character');

export const active = Symbol.for('cst-tokens/active');
export const suspended = Symbol.for('cst-tokens/suspended');
export const accepted = Symbol.for('cst-tokens/accepted');
export const rejected = Symbol.for('cst-tokens/rejected');
