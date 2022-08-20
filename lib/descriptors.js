const { isArray } = Array;
const stripArray = (value) => (isArray(value) ? value[0] : value);

const Reference = (name) => {
  return {
    type: 'Reference',
    value: name,
    mergeable: false,
    build() {
      return { type: 'Reference', value: name };
    },
    *matchChrs() {
      throw new Error('not implemented');
    },
    toString() {
      return `ref\`${name}\``;
    },
  };
};

const ref = (value) => Reference(stripArray(value));

module.exports = { Reference, ref };
