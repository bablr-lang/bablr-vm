const regexEscape = require('escape-string-regexp');
const { isArray } = require('./utils/array');

const breakAhead = /(?=[(){}\s\/\\&#@!`+^%?<>,.;:'"|~-]|$)/.source;

class Token {
  constructor(value = '') {
    this.value = value;
  }

  get type() {
    throw new Error('Not implemented');
  }

  build(value) {
    throw new Error('Not implemented');
  }

  matchToken(token) {
    throw new Error('Not implemented');
  }

  matchString(str) {
    throw new Error('Not implemented');
  }
}

class Comment extends Token {
  get type() {
    return 'Comment';
  }

  build(value) {
    return { type: 'Comment', value: value || this.value };
  }

  matchToken(token) {
    return token.type === 'Comment';
  }

  matchString(str) {
    return /^(\/\/[^\n]*|\/\*.*?\*\/)/.exec(str)?.[0];
  }
}

class Whitespace extends Token {
  get type() {
    return 'Whitespace';
  }

  build(value) {
    return { type: 'Whitespace', value: value || this.value || ' ' };
  }
  matchToken(token) {
    // What should I do with '' whitespace values?
    return token.type === 'Whitespace';
  }
  matchString(str) {
    return /^\s+/.exec(str)?.[0];
  }
}

class Punctuator extends Token {
  get type() {
    return 'Punctuator';
  }

  build(value) {
    return { type: 'Punctuator', value: value || this.value };
  }

  matchToken(token) {
    const { type, value } = token;
    return type === 'Punctuator' && value === this.value;
  }

  matchString(str) {
    const { value } = this;
    return str.startsWith(value) ? value : null;
  }
}

class Keyword extends Token {
  get type() {
    return 'Keyword';
  }

  build(value) {
    return { type: 'Keyword', value: value || this.value };
  }

  matchToken(token) {
    const { type, value } = token;
    return type === 'Keyword' && value === this.value;
  }

  matchString(str) {
    const { value } = this;
    return new RegExp(`^${regexEscape(value)}${breakAhead}`).exec(str)?.[0];
  }
}

class Identifier extends Token {
  get type() {
    return 'Identifier';
  }

  build(value) {
    return { type: 'Identifier', value: value || this.value };
  }

  matchToken(token) {
    const { type, value } = token;
    return type === 'Identifier' && value === this.value;
  }

  matchString(str) {
    const { value } = this;
    return new RegExp(`^${regexEscape(value)}${breakAhead}`).exec(str)?.[0];
  }
}

class String extends Token {
  get type() {
    return 'String';
  }

  build(value) {
    return { type: 'String', value: value || this.value };
  }

  matchToken(token) {
    const { type, value } = token;
    return type === 'String' && value.slice(1, -1) === this.value;
  }

  matchString(str) {
    const { value } = this;
    let strPos = 0;
    let failed = false;

    if (str[strPos] === "'" || str[strPos] === '"') {
      strPos++;
    } else {
      failed = true;
    }

    if (!failed) {
      for (const chr of value) {
        // TODO escapes
        //   unnecessary escapes, e.g. \d
        //   unnecessary unicode escapes, e.g. \u0064
        if (str[strPos] === chr) {
          strPos++;
        } else {
          failed = true;
        }
      }
    }

    if ((!failed && str[strPos] === "'") || str[strPos] === '"') {
      strPos++;
    } else {
      failed = true;
    }

    return failed ? null : str.slice(0, strPos);
  }
}

class Reference extends Token {
  get type() {
    return 'Reference';
  }

  build(value) {
    return { type: 'Reference', value: value || this.value };
  }

  matchToken(token) {
    const { type, value } = token;
    return type === 'Reference' && value === this.value;
  }

  matchString(str) {
    throw new Error('A reference should never be matched against a string');
  }
}

const ws = new Whitespace();
const cmt = new Comment();

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

const stripArray = (value) => (isArray(value) ? value[0] : value);

module.exports = {
  Comment,
  Whitespace,
  Punctuator,
  Keyword,
  Identifier,
  String,
  Reference,
  Separator,

  // Shorthand names for more concise grammar definitions
  // stripArray ensures that both ID`value` and ID(value) are valid
  CMT: (value = '') => new Comment(stripArray(value)),
  WS: (value = '') => new Whitespace(stripArray(value)),
  PN: (value = '') => new Punctuator(stripArray(value)),
  KW: (value = '') => new Keyword(stripArray(value)),
  ID: (value = '') => new Identifier(stripArray(value)),
  STR: (value = '') => new String(stripArray(value)),
  ref: (value = '') => new Reference(stripArray(value)),
  _: Separator,
};
