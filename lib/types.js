const regexEscape = require('escape-string-regexp');
const { isArray } = require('./utils/array');

const stripArray = (value) => (isArray(value) ? value[0] : value);

const breakAhead = /(?=[(){}\s\/\\&#@!`+^%?<>,.;:'"|~-]|$)/.source;

const Comment = (value) => ({
  type: 'Comment',
  value: stripArray(value),
  build(value) {
    return { type: 'Comment', value: value || this.value };
  },
  matchToken(token) {
    return token.type === 'Comment';
  },
  matchString(str) {
    return /^(\/\/[^\n]*|\/\*.*?\*\/)/.exec(str)?.[0];
  },
});

const Whitespace = (value) => ({
  type: 'Whitespace',
  value: stripArray(value),
  build(value) {
    return { type: 'Whitespace', value: value || this.value || ' ' };
  },
  matchToken(token) {
    // What should I do with '' whitespace values?
    return token.type === 'Whitespace';
  },
  matchString(str) {
    return /^\s+/.exec(str)?.[0];
  },
});

const Punctuator = (value) => ({
  type: 'Punctuator',
  value: stripArray(value),
  build(value) {
    return { type: 'Punctuator', value: value || this.value };
  },
  matchToken(token) {
    const { type, value } = token;
    return type === 'Punctuator' && value === this.value;
  },
  matchString(str) {
    const { value } = this;
    return str.startsWith(value) ? value : null;
  },
});

const Keyword = (value) => ({
  type: 'Keyword',
  value: stripArray(value),
  build(value) {
    return { type: 'Keyword', value: value || this.value };
  },
  matchToken(token) {
    const { type, value } = token;
    return type === 'Keyword' && value === this.value;
  },
  matchString(str) {
    const { value } = this;
    return new RegExp(`^${regexEscape(value)}${breakAhead}`).exec(str)?.[0];
  },
});

const Identifier = (value) => ({
  type: 'Identifier',
  value: stripArray(value),
  build(value) {
    return { type: 'Identifier', value: value || this.value };
  },
  matchToken(token) {
    const { type, value } = token;
    return type === 'Identifier' && value === this.value;
  },
  matchString(str) {
    const { value } = this;
    return new RegExp(`^${regexEscape(value)}${breakAhead}`).exec(str)?.[0];
  },
});

const Reference = (value) => ({
  type: 'Reference',
  value: stripArray(value),
  build(value) {
    return { type: 'Reference', value: value || this.value };
  },
  matchToken(token) {
    const { type, value } = token;
    return type === 'Reference' && value === this.value;
  },
  matchString(str) {
    throw new Error('A references should never be matched against a string');
  },
});

const ws = Whitespace();
const cmt = Comment();

const Separator = {
  type: 'Thunk',
  *allow(b) {
    let wsToken, cmtToken;
    do {
      // TODO: make this rolling
      // currently if it finds a whitespace it then checks for a CMT *and* a WS before it gives up
      [wsToken = null] = b.allow(ws);
      [cmtToken = null] = b.allow(cmt);
      if (wsToken) yield wsToken;
      if (cmtToken) yield cmtToken;
    } while (cmtToken || wsToken);
  },
  *ensure(b) {
    let wsToken, cmtToken;
    let ensured = false;
    do {
      [wsToken = null] = b.allow(ws);
      [cmtToken = null] = b.allow(cmt);
      if (wsToken) yield wsToken;
      if (cmtToken) yield cmtToken;
      ensured = ensured || !!wsToken || !!cmtToken;
    } while (cmtToken || wsToken);
    if (!ensured) {
      yield* b.ensure(Whitespace` `);
    }
  },
};

module.exports = {
  Comment,
  Whitespace,
  Punctuator,
  Keyword,
  Identifier,
  Reference,
  Separator,

  // Shorthand names for more concise grammar definitions
  CMT: Comment,
  WS: Whitespace,
  PN: Punctuator,
  KW: Keyword,
  ID: Identifier,
  ref: Reference,
  _: Separator,
};
