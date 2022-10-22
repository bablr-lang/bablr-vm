const isArray = Array;

const notEmpty = (arr) => arr != null && arr.length > 0;

const nullOr = (arr) => (arr.length === 0 ? null : arr);

module.exports = { isArray, notEmpty, nullOr };
