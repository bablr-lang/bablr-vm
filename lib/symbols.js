const _ = Symbol('private');
const _actual = Symbol('actual');
const _chrs = Symbol('chrs');

const Fragment = Symbol.for('@cst-tokens/grammars/Fragment');

const eatChrs = Symbol.for('@cst-tokens/commands/eatChrs');
const matchChrs = Symbol.for('@cst-tokens/commands/matchChrs');
const eatMatchChrs = Symbol.for('@cst-tokens/commands/eatMatchChrs');

const eatGrammar = Symbol.for('@cst-tokens/commands/eatGrammar');
const matchGrammar = Symbol.for('@cst-tokens/commands/matchGrammar');
const eatMatchGrammar = Symbol.for('@cst-tokens/commands/eatMatchGrammar');

const eat = Symbol.for('@cst-tokens/commands/eat');
const match = Symbol.for('@cst-tokens/commands/match');
const eatMatch = Symbol.for('@cst-tokens/commands/eatMatch');

const reference = Symbol.for('@cst-tokens/commands/reference');

const startNode = Symbol.for('@cst-tokens/commands/startNode');
const endNode = Symbol.for('@cst-tokens/commands/endNode');

const leadingHoist = Symbol.for('@cst-tokens/hoist/leading');
const trailingHoist = Symbol.for('@cst-tokens/hoist/trailing');

module.exports = {
  _,
  _actual,
  _chrs,
  Fragment,
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
  leadingHoist,
  trailingHoist,
};
