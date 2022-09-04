const debug = require('debug');
const traces = debug.enabled('cst-tokens') ? true : null;
const { ref } = require('./descriptors.js');

function* branch() {
  return yield {
    type: 'branch',
    value: null,
    error: traces && new Error(),
  };
}

function* accept(state) {
  yield {
    type: 'accept',
    value: state,
    error: traces && new Error(),
  };
}

function* reject(state) {
  yield {
    type: 'reject',
    value: state,
    error: traces && new Error(),
  };
}

function* emit(tokens) {
  for (const token of tokens) {
    yield {
      type: 'emit',
      value: token,
      error: traces && new Error(),
    };
  }
}

function* matchChrs(pattern) {
  const state = yield* branch();

  const chrs = yield* takeChrs(pattern);

  yield* accept(state);

  return chrs;
}

function* takeChrs(pattern) {
  let chrs = '';

  const result = yield {
    type: 'takeChrs',
    value: pattern,
    error: traces && new Error(),
  };
  if (result) {
    chrs += result;
  } else {
    return null;
  }

  return chrs;
}

function* match(...descriptors) {
  const state = yield* branch();

  const tokens = yield* take(...descriptors);

  if (tokens) yield* accept(state);

  return tokens;
}

function* take(...descriptors) {
  const tokens = [];

  for (const descriptor of descriptors) {
    const command = {
      type: 'take',
      value: descriptor,
      error: traces && new Error(),
    };
    const result = yield command;

    if (result) {
      tokens.push(...result);
    } else {
      yield* reject(command);
      return null;
    }
  }

  return tokens;
}

function* eat(...descriptors) {
  const tokens = yield* take(...descriptors);

  yield* emit(tokens);

  return tokens;
}

function* eatMatch(...descriptors) {
  const tokens = yield* match(...descriptors);

  if (tokens) yield* emit(tokens);

  return tokens;
}

module.exports = {
  ref,
  branch,
  accept,
  reject,
  emit,
  matchChrs,
  takeChrs,
  match,
  take,
  eat,
  eatMatch,
};
