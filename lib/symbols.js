const _ = Symbol('private');
const _actual = Symbol('actual');
const _chrs = Symbol('chrs');

const none = Symbol('none');
const defer = Symbol('defer');

const EOF = Symbol.for('@cst-tokens/chr/endOfFile');

const eatChrs = Symbol.for('@cst-tokens/command/eatChrs');
const matchChrs = Symbol.for('@cst-tokens/command/matchChrs');
const eatMatchChrs = Symbol.for('@cst-tokens/command/eatMatchChrs');

const eatGrammar = Symbol.for('@cst-tokens/command/eatGrammar');
const matchGrammar = Symbol.for('@cst-tokens/command/matchGrammar');
const eatMatchGrammar = Symbol.for('@cst-tokens/command/eatMatchGrammar');

const eat = Symbol.for('@cst-tokens/command/eat');
const match = Symbol.for('@cst-tokens/command/match');
const eatMatch = Symbol.for('@cst-tokens/command/eatMatch');

const reference = Symbol.for('@cst-tokens/command/reference');

const startNode = Symbol.for('@cst-tokens/command/startNode');
const endNode = Symbol.for('@cst-tokens/command/endNode');

const startNodeToken = Symbol.for('@cst-tokens/token/startNode');
const endNodeToken = Symbol.for('@cst-tokens/token/endNode');

const leadingHoist = Symbol.for('@cst-tokens/hoist/leading');
const trailingHoist = Symbol.for('@cst-tokens/hoist/trailing');

const active = Symbol.for('@cst-tokens/status/active');
const suspended = Symbol.for('@cst-tokens/status/suspended');
const accepted = Symbol.for('@cst-tokens/status/accepted');
const rejected = Symbol.for('@cst-tokens/status/rejected');

module.exports = {
  _,
  _actual,
  _chrs,
  none,
  defer,
  EOF,
  eatChrs,
  matchChrs,
  eatMatchChrs,
  eatGrammar,
  matchGrammar,
  eatMatchGrammar,
  eat,
  match,
  eatMatch,
  reference,
  startNode,
  endNode,
  startNodeToken,
  endNodeToken,
  leadingHoist,
  trailingHoist,
  active,
  suspended,
  accepted,
  rejected,
};
