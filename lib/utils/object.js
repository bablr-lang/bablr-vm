const get = (obj, path) => {
  let value = obj;
  for (const part of path.split('.')) {
    value = value[part];
  }
  return value;
};

const set = (obj, path, value) => {
  let target = obj;
  const parts = path.split('.');
  const lastPart = parts.pop();
  for (const part of parts) {
    const isArray = !isNaN(parseInt(part, 10));
    if (target[part] === undefined) {
      target[part] = isArray ? [] : {};
    }
    target = target[part];
  }
  target[lastPart] = value;
};

module.exports = { get, set };
