const debug = require('debug');

const emit = (cstTokens) => ({
  type: 'emit',
  value: cstTokens,
  error: debug.enabled('cst-tokens') ? new Error() : undefined,
});
const match = (...descriptors) => ({
  type: 'match',
  value: descriptors,
  error: debug.enabled('cst-tokens') ? new Error() : undefined,
});
const take = (...descriptors) => ({
  type: 'take',
  value: descriptors,
  error: debug.enabled('cst-tokens') ? new Error() : undefined,
});

module.exports = { emit, match, take };
