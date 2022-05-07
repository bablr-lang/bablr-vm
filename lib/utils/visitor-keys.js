const { VISITOR_KEYS } = require('@babel/types');

const visitorKeys = {
  ...VISITOR_KEYS,
  Literal: [],
};

module.exports = { visitorKeys };
