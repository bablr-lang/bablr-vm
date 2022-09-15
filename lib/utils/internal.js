const indent = (state) => {
  let str = '';
  let state_ = state;
  while (state_?.parent) {
    str += '  ';
    state_ = state_.parent;
  }
  return str;
};

module.exports = { indent };
