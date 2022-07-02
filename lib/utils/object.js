const get = (obj, path) => {
  let value = obj;
  for (const part of path.split('.')) {
    value = value[part];
  }
  return value;
};

module.exports = { get };
