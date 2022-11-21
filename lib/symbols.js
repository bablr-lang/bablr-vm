export const _ = Symbol('private');
export const _actual = Symbol('actual');
export const _chrs = Symbol('chrs');

export const none = Symbol('none');
export const defer = Symbol('defer');

export const EOF = Symbol.for('@cst-tokens/chr/endOfFile');

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

export const startNode = Symbol.for('@cst-tokens/command/startNode');
export const endNode = Symbol.for('@cst-tokens/command/endNode');

export const startNodeToken = Symbol.for('@cst-tokens/token/startNode');
export const endNodeToken = Symbol.for('@cst-tokens/token/endNode');

export const leadingHoist = Symbol.for('@cst-tokens/hoist/leading');
export const trailingHoist = Symbol.for('@cst-tokens/hoist/trailing');

export const active = Symbol.for('@cst-tokens/status/active');
export const suspended = Symbol.for('@cst-tokens/status/suspended');
export const accepted = Symbol.for('@cst-tokens/status/accepted');
export const rejected = Symbol.for('@cst-tokens/status/rejected');
