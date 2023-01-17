export const _ = Symbol.for('_');
export const _actual = Symbol.for('@cst-tokens/facade/actual');

export const none = Symbol('none');
export const defer = Symbol('defer');

export const up = Symbol('up');
export const down = Symbol('down');

export const EOF = Symbol.for('@cst-tokens/chr/endOfFile');

export const Fragment = Symbol.for('@cst-tokens/node/Fragment');
export const Gap = Symbol.for('@cst-tokens/node/Gap');

export const startNode = Symbol('@cst-tokens/command/startNode');
export const endNode = Symbol('@cst-tokens/command/endNode');

export const eatChrs = Symbol.for('@cst-tokens/command/eatChrs');
export const matchChrs = Symbol.for('@cst-tokens/command/matchChrs');
export const eatMatchChrs = Symbol.for('@cst-tokens/command/eatMatchChrs');

export const eatProduction = Symbol.for('@cst-tokens/command/eatProduction');
export const matchProduction = Symbol.for('@cst-tokens/command/matchProduction');
export const eatMatchProduction = Symbol.for('@cst-tokens/command/eatMatchProduction');

export const eat = Symbol.for('@cst-tokens/command/eat');
export const match = Symbol.for('@cst-tokens/command/match');
export const eatMatch = Symbol.for('@cst-tokens/command/eatMatch');

export const reference = Symbol.for('@cst-tokens/command/reference');

export const startPathInnerRange = Symbol.for('@cst-tokens/command/startPathInnerRange');
export const endPathInnerRange = Symbol.for('@cst-tokens/command/endPathInnerRange');

export const pushLexicalContext = Symbol.for('@cst-tokens/command/pushLexicalContext');
export const popLexicalContext = Symbol.for('@cst-tokens/command/popLexicalContext');

export const active = Symbol.for('@cst-tokens/status/active');
export const suspended = Symbol.for('@cst-tokens/status/suspended');
export const accepted = Symbol.for('@cst-tokens/status/accepted');
export const rejected = Symbol.for('@cst-tokens/status/rejected');
