const isArray = Array;

const notEmpty = (arr) => arr != null && arr.length > 0;

const nullOr = (arr) => (arr.length === 0 ? null : arr);

function* arraySlice(arr, start, end) {
  const increment = end > start ? 1 : -1;

  for (let i = start; i < end; i += increment) {
    yield arr[i];
  }
}

const findRight = (arr, predicate) => {
  for (let i = arr.length - 1; i >= 0; i--) {
    const value = arr[i];
    if (predicate(value)) return value;
  }
  return null;
};

module.exports = { isArray, notEmpty, nullOr, arraySlice, findRight };
