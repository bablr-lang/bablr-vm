const regexEscape = require('escape-string-regexp');
const { parse } = require('@iter-tools/regex');
const { _actual } = require('./symbols.js');

const matchDescriptor = (command, baseState) => {
  const { value: descriptor, error: cause } = command;
  const descCo = descriptor.takeChrs();
  let descStep = descCo.next();
  let state = baseState;
  let debug_ = false;
  let result = null;

  if (state.source.type === 'TokensSource') {
    state.source[_actual].startDescriptor(descriptor, descCo);
  }

  while (!descStep.done) {
    const command = descStep.value;
    const { type, value } = command;
    let descReturnValue = undefined;

    if (debug_) {
      debug_ = false;
      debugger;
    }

    switch (type) {
      case 'debug': {
        debug_ = true;
        break;
      }

      case 'branch': {
        if (value != null) {
          throw new Error('unknown branch value');
        }

        state = state.branch();
        descReturnValue = state.facade;
        break;
      }

      case 'accept': {
        if (value !== state.facade) {
          throw new Error('The state to be accepted is not on top');
        }

        if (state === baseState) {
          throw new Error('Descriptor accepted a state it did not create');
        }

        state = state.accept();
        descReturnValue = state.facade;
        break;
      }

      case 'reject': {
        if (state === baseState || !state.parent) {
          throw new Error('Descriptor rejected a state it did not create');
        }

        const nextState = state.reject();

        if (nextState) {
          state = nextState;
          descReturnValue = state.facade;
        }
        break;
      }

      case 'takeChrs': {
        let pattern = value;

        if (typeof pattern === 'string') {
          pattern = new RegExp(regexEscape(pattern), 'y');
        }

        if (!(pattern instanceof RegExp)) {
          throw new Error('Unsupported pattern');
        }

        const flags = pattern.flags.includes('y') ? pattern.flags : pattern.flags + 'y';

        const result = state.source.exec(parse(pattern.source, flags));

        descReturnValue = result;

        break;
      }

      default:
        throw new Error(`Unexpected command of {type: ${type}} emitted from descriptor.takeChrs`);
    }
    descStep = descCo.next(descReturnValue);
  }

  result = descStep.value;

  if (state.source.type === 'TokensSource') {
    state.source[_actual].endDescriptor(result);
  }

  if (result === '') {
    throw new Error('Descriptors must not be optional', cause && { cause });
  }

  if (state !== baseState) {
    throw new Error('Descriptor state stack not properly unwound');
  }

  return result;
};

module.exports = { matchDescriptor };
