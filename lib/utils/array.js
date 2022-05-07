const { isArray } = Array;

const notEmpty = (arr) => arr != null && arr.length > 0;

module.exports = { isArray, notEmpty };
