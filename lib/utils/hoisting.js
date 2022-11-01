const { Fragment } = require('../symbols.js');

const getHoistingParentState = (state) => {
  if (state.node.type === Fragment) {
    throw new Error("Cannot get a fragment's hoisting parent");
  }

  const { node } = state;
  let s = state;
  do {
    while (s && s.node === node) s = s.parent || null;
  } while (s && s.hoisting && (s = s.parent));
  return s;
};

module.exports = { getHoistingParentState };
