const debug = require('debug');
const traces = debug.enabled('cst-tokens') ? true : null;
const { ref } = require('./descriptors.js');

function* exec(pattern) {
  let chrs = '';

  const result = yield {
    type: 'exec',
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

function* match(...descriptors) {
  const tokens = [];

  const state = yield* branch();

  for (const descriptor of descriptors) {
    const command = {
      type: 'match',
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

  yield* accept(state);

  return tokens;
}

function* take(...descriptors) {
  const tokens = [];
  for (const descriptor of descriptors) {
    const command = {
      type: 'match',
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

  yield* emit(tokens);

  return tokens;
}

function* takeMatch(...descriptors) {
  const state = yield* branch();

  const tokens = [];
  for (const descriptor of descriptors) {
    const command = {
      type: 'match',
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

  yield* accept(state);

  yield* emit(tokens);

  return tokens;
}

module.exports = {
  ref,
  exec,
  branch,
  accept,
  reject,
  emit,
  match,
  take,
  takeMatch,
};
