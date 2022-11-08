const emptyStack = require('@iter-tools/imm-stack');
const { exec: exec_ } = require('@iter-tools/regex');
const { get } = require('../utils/object.js');
const { Resolver } = require('../resolver.js');
const { debugSrc } = require('../debug.js');
const { _, _actual, _chrs } = require('../symbols.js');

const { isArray } = Array;

function validateNode(node) {
  if (!node) {
    throw new Error('no node');
  }

  if (!node.cstTokens) {
    throw new Error('node.cstTokens is not defined');
  }

  if (!isArray(node.cstTokens)) {
    throw new Error('node.cstTokens is not an array');
  }
}

class TokensSourceFacade {
  constructor(source, node, writable = true) {
    this[_] = { source, node, writable };
  }

  static from(node) {
    return new TokensSourceFacade(new TokensSource(node), node);
  }

  get [_actual]() {
    if (!this[_].writable) {
      this[_].writable = true;
      this[_].source = this[_].source.branch();
    }
    return this[_].source;
  }

  *[_chrs]() {
    while (!this.done) {
      yield this.value;
      this[_actual].advanceChr(this.node);
    }
  }

  get type() {
    return 'TokensSource';
  }

  get node() {
    return this[_].node;
  }

  get index() {
    return this[_].source.index;
  }

  get done() {
    return this[_].source.done;
  }

  get value() {
    return this[_].source.value;
  }

  get token() {
    return this[_].source.token;
  }

  exec(pattern) {
    const { source } = this[_];
    const { chrIndex } = source;
    const result = exec_(pattern, this[_chrs]())[0] || null;

    // Backtracking the input allows us to avoid having to fork before executing
    // We give back tokens the regex engine consumed but did not match
    while (this.chrIndex > chrIndex + (result ? result.length : 0)) {
      this[_actual].advanceChr(this.node, true);
    }

    return result;
  }

  testExec(pattern) {
    const { source } = this[_];
    const { chrIndex } = source;
    const result = exec_(pattern, this[_chrs]())[0] || null;

    // Backtracking the input allows us to avoid having to fork before executing
    // We give back tokens the regex engine consumed but did not match
    while (this.chrIndex > chrIndex) {
      this[_actual].advanceChr(this.node, true);
    }

    return result;
  }

  *peekTokens() {
    let { source } = this[_];

    while (!source.done) {
      yield source.token;
      source = source === this[_].source ? source.branch(true) : source;
      source.advance(this.node);
    }
  }

  *peekChrs() {
    let { source } = this[_];

    while (!source.done) {
      yield source.value;
      source = source === this[_].source ? source.branch(true) : source;
      source.advanceChr(this.node);
    }
  }

  branch(node = this.node) {
    const { source } = this[_];

    return new TokensSourceFacade(source, node, node !== this.node);
  }

  accept(source) {
    if (source[_].source !== this[_].source) {
      this[_actual].accept(source[_].source);
    }
    return this;
  }

  reject() {
    if (this[_].writable) {
      this[_].source.reject();
    }
  }

  toString() {
    return this[_].source.format();
  }
}

class TokensSource {
  constructor(
    sourceNode,
    stack = emptyStack,
    sourceTokens = sourceNode.cstTokens,
    descriptor = null,
    resolver = new Resolver(sourceNode),
    index = 0,
    chrIndex = 0,
    offset = 0,
  ) {
    validateNode(sourceNode);

    this.stack = stack;
    this.sourceNode = sourceNode;
    this.sourceTokens = sourceTokens;
    this.descriptor = descriptor;
    this.resolver = resolver;
    this.index = index;
    this.chrIndex = chrIndex;
    this.offset = offset;

    if (!this.nodeDone && this.token.type === 'Reference') {
      this.enterReferences();
    }
  }

  get value() {
    return this.sourceTokens[this.index].value[this.offset];
  }

  get done() {
    return this.descriptor ? this.offset === null : this.nodeDone && !this.stack.size;
  }

  get token() {
    return this.sourceTokens[this.index];
  }

  get nodeDone() {
    return this.index >= this.sourceTokens.length;
  }

  get tokensDone() {
    return !this.stack.size && this.nodeDone;
  }

  branch(lookahead = false) {
    // prettier-ignore
    const { stack, sourceNode, sourceTokens, descriptor, resolver, index, chrIndex, offset } = this;

    if (!lookahead && debugSrc.enabled) debugSrc(`      branch (at ${this.format(stack.value)})`);

    return new TokensSource(
      sourceNode,
      stack,
      sourceTokens,
      descriptor,
      lookahead ? resolver.branch() : resolver,
      index,
      chrIndex,
      offset,
    );
  }

  accept(source) {
    // prettier-ignore
    const { stack, sourceNode, sourceTokens, descriptor, resolver, index, chrIndex, offset } = source;

    if (debugSrc.enabled) debugSrc(`      accept (at ${this.format(source)})`);

    this.stack = stack;
    this.sourceNode = sourceNode;
    this.sourceTokens = sourceTokens;
    this.descriptor = descriptor;
    this.resolver = resolver;
    this.index = index;
    this.chrIndex = chrIndex;
    this.offset = offset;

    return this;
  }

  reject() {
    debugSrc(`      reject (at ${this.format()})`);
  }

  startDescriptor(descriptor) {
    if (this.descriptor) {
      throw new Error('cannot select tokens because tokens are already selected');
    }

    this.descriptor = descriptor;
    this.offset = 0;
  }

  endDescriptor(result) {
    if (result && this.offset !== null) {
      throw new Error('Cannot match a partial token');
    }

    this.descriptor = undefined;
  }

  leaveReferences(backwards = false) {
    while (this.nodeDone && this.stack.size) {
      const { sourceNode, sourceTokens, resolver, index } = this.stack.value;

      this.sourceNode = sourceNode;
      this.sourceTokens = sourceTokens;
      this.resolver = resolver;
      this.index = index + (backwards ? -1 : 1);
      this.stack = this.stack.pop();
    }
  }

  enterReferences(backwards = false) {
    while (!this.nodeDone && this.token.type === 'Reference') {
      const { sourceNode, sourceTokens, resolver, index, token } = this;
      const child = get(sourceNode, resolver.consume(token.value));
      const childResolver = new Resolver(child);

      validateNode(child);

      this.sourceNode = child;
      this.sourceTokens = child.cstTokens;
      this.resolver = childResolver;
      this.index = backwards ? this.sourceTokens.length - 1 : 0;
      this.stack = this.stack.push({
        sourceNode,
        sourceTokens,
        resolver,
        index,
      });
    }
  }

  advance(node, backwards = false) {
    const { descriptor } = this;
    const { type, mergeable } = descriptor;
    const increment = backwards ? -1 : 1;

    if (!descriptor) {
      throw new Error('tokensSource.advance cannot be called when no descriptor is active');
    }

    if (this.done) {
      return;
    }

    this.index += increment;

    if (backwards ? this.index < 0 : this.index >= this.sourceTokens.length) {
      this.leaveReferences(backwards);
    } else {
      this.enterReferences(backwards);
    }

    const hasNext = !this.tokensDone && this.token.type === type && mergeable;

    this.offset = hasNext ? (backwards ? this.token.value.length - 1 : 0) : null;
  }

  advanceChr(node, backwards = false) {
    const { descriptor } = this;
    const increment = backwards ? -1 : 1;

    if (!descriptor) {
      throw new Error('tokensSource.advanceChr cannot be called when no descriptor is active');
    }

    if (this.token.type === 'Reference') {
      throw new Error('tokensSource.advanceChr cannot consume a reference token');
    }

    this.offset += increment;
    this.chrIndex += increment;

    if (backwards ? this.offset < 0 : this.offset >= this.token.value.length) {
      this.advance(node, backwards);
    }
  }

  format(frame = {}) {
    const { sourceNode = this.sourceNode, index = this.index } = frame;

    return `${sourceNode.type}.cstTokens[${index}]`;
  }
}

module.exports = { TokensSource, TokensSourceFacade };
