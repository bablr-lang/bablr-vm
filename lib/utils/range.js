const { isInteger } = Number;

const hasRange = (node) => !!node.range || (isInteger(node.start) && isInteger(node.end));

const getRange = (node) => {
  if (node.range) {
    return node.range;
  } else if (node.start && node.end) {
    return [node.start, node.end];
  }
  return null;
};

module.exports = { hasRange, getRange };
