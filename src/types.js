const Comment = (value) => ({
  type: 'Comment',
  value,
  build() {
    return { type: 'Comment', value: this.value };
  },
  match(token) {
    return token.type === 'Comment';
  },
});

const Whitespace = (value) => ({
  type: 'Whitespace',
  value,
  build() {
    return { type: 'Whitespace', value: this.value || ' ' };
  },
  match(token) {
    // What should I do with '' whitespace values?
    return token.type === 'Whitespace';
  },
});

const Punctuator = (value) => ({
  type: 'Punctuator',
  value,
  build() {
    return { type: 'Punctuator', value: this.value };
  },
  match(token) {
    const { type, value } = token;
    return type === 'Punctuator' && value === this.value;
  },
});

const Keyword = (value) => ({
  type: 'Keyword',
  value,
  build() {
    return { type: 'Keyword', value: this.value };
  },
  match(token) {
    const { type, value } = token;
    return type === 'Keyword' && value === this.value;
  },
});

const Identifier = (value) => ({
  type: 'Identifier',
  value,
  build() {
    return { type: 'Identifier', value: this.value };
  },
  match(token) {
    const { type, value } = token;
    return type === 'Identifier' && value === this.value;
  },
});

const Reference = (value) => ({
  type: 'Reference',
  value,
  build() {
    return { type: 'Reference', value: this.value };
  },
  match(token) {
    const { type, value } = token;
    return type === 'Reference' && value === this.value;
  },
});

module.exports = {
  Comment,
  Whitespace,
  Punctuator,
  Keyword,
  Identifier,
  Reference,

  // Shorthand names for more concise grammar definitions
  CMT: Comment,
  WS: Whitespace,
  PN: Punctuator,
  KW: Keyword,
  ID: Identifier,
  ref: Reference,
};
