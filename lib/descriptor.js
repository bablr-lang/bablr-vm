const regexEscape = require('escape-string-regexp');
const { parse } = require('@iter-tools/regex');
const { _actual } = require('./symbols.js');
const { Coroutine } = require('./grammar.js');

const matchDescriptor = (descriptor, initialState) => {
  const co = new Coroutine(descriptor.eatChrs());
  let s = initialState;
  let debug_ = false;

  if (s.source.type === 'TokensSource') {
    s.source[_actual].startDescriptor(descriptor, co);
  }

  while (!co.done) {
    const { value: command } = co;
    const { type, value } = command;
    let returnValue = undefined;

    if (debug_) {
      debug_ = false;
      debugger;
    }

    switch (type) {
      case 'debug': {
        debug_ = true;
        break;
      }

      case 'reject': {
        if (s === initialState || !s.parent) {
          throw new Error('Descriptor rejected a state it did not create');
        }

        const nextState = s.reject();

        if (nextState) {
          s = nextState;
          returnValue = s.facade;
        }
        break;
      }

      case 'matchChrs':
      case 'eatMatchChrs':
      case 'eatChrs': {
        let pattern = value;

        if (typeof pattern === 'string') {
          pattern = new RegExp(regexEscape(pattern), 'y');
        }

        if (!(pattern instanceof RegExp)) {
          throw new Error('Unsupported pattern');
        }

        const flags = pattern.flags.includes('y') ? pattern.flags : pattern.flags + 'y';
        const pattern_ = parse(pattern.source, flags);

        const result = type !== 'matchChrs' ? s.source.exec(pattern_) : s.source.testExec(pattern_);

        if (type === 'eatChrs' && !result) {
          co.return(null);
        }

        returnValue = result;
        break;
      }

      default:
        throw new Error(`Unexpected command of {type: ${type}} emitted from descriptor.eatChrs`);
    }
    if (!co.done) {
      co.advance(returnValue);
    }
  }

  if (s.source.type === 'TokensSource') {
    s.source[_actual].endDescriptor(co.value);
  }

  return [s, co.value];
};

module.exports = { matchDescriptor };
