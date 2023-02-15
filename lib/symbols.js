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

export const startNode = Symbol.for('cst-tokens/start-node');
export const endNode = Symbol.for('cst-tokens/end-node');

export const startToken = Symbol.for('cst-tokens/start-token');
export const endToken = Symbol.for('cst-tokens/end-token');

export const eat = Symbol.for('cst-tokens/eat');
export const match = Symbol.for('cst-tokens/match');
export const eatMatch = Symbol.for('cst-tokens/eat-match');

export const production = Symbol.for('cst-tokens/production');
export const terminal = Symbol.for('cst-tokens/terminal');

export const active = Symbol.for('cst-tokens/active');
export const suspended = Symbol.for('cst-tokens/suspended');
export const accepted = Symbol.for('cst-tokens/accepted');
export const rejected = Symbol.for('cst-tokens/rejected');
