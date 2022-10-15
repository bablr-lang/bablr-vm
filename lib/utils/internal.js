const indent = (state, text = '') => {
  let str = '      ';

  let state_ = state;
  while (state_?.parent) {
    str += '  ';
    state_ = state_.parent;
  }

  return str + text;
};

const indentModule = (state, text = '') => {
  let str = '  ';

  let state_ = state;
  while (state_?.parent) {
    str += '  ';
    state_ = state_.parent;
  }

  return str + text;
};

module.exports = { indent, indentModule };
