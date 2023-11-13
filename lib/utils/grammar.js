const { hasOwn } = Object;

export function getCovers(grammar) {
  return hasOwn(grammar, 'covers') ? grammar.covers : null;
}

export function isSubtypeOf(grammar, supertype, type) {
  return supertype === type || !!getCovers(grammar)?.get(supertype)?.has(type);
}
