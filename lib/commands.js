const emit = (tokens) => ({ type: 'emit', value: tokens });
const match = (...descriptors) => ({ type: 'match', value: descriptors });
const take = (...descriptors) => ({ type: 'take', value: descriptors });

module.exports = { emit, match, take };
