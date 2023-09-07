const { hasOwn } = Object;

export function getAliases(grammar) {
  return hasOwn(grammar, 'aliases') ? grammar.aliases : null;
}

export function isSubtypeOf(grammar, supertype, type) {
  return supertype === type || !!getAliases(grammar)?.get(supertype)?.has(type);
}
