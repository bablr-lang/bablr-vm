const emptyStack = require('@iter-tools/imm-stack');
const { exec: exec_ } = require('@iter-tools/regex');
const debug = require('debug')('cst-tokens:src');
const { get } = require('../utils/object.js');
const { Resolver } = require('../resolver.js');
const { _, _actual } = require('../symbols.js');

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

  static from(node, isHoistable) {
    return new TokensSourceFacade(new TokensSource(node, isHoistable), node);
  }

  get [_actual]() {
    if (!this[_].writable) {
      this[_].writable = true;
      this[_].source = this[_].source.branch();
    }
    return this[_].source;
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
    const result = exec_(pattern, this.peekChrs())[0] || null;

    if (result) {
      for (let i = 0; i < result.length; i++) {
        this[_actual].advanceChr(this.node);
      }
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

    return new TokensSourceFacade(source, node, false);
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
    isHoistable,
    stack = emptyStack,
    sourceTokens = sourceNode.cstTokens,
    descriptor = null,
    resolver = new Resolver(sourceNode),
    index = 0,
    offset = 0,
  ) {
    validateNode(sourceNode);

    this.isHoistable = isHoistable;
    this.stack = stack;
    this.sourceNode = sourceNode;
    this.sourceTokens = sourceTokens;
    this.resolver = resolver;
    this.index = index;
    this.descriptor = descriptor;
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
    const { isHoistable, stack, sourceNode, sourceTokens, descriptor, resolver, index, offset } = this;

    if (!lookahead) debug(`branch (at ${this.format(stack.value)})`);

    return new TokensSource(
      sourceNode,
      isHoistable,
      stack,
      sourceTokens,
      descriptor,
      lookahead ? resolver.branch() : resolver,
      index,
      offset,
    );
  }

  accept(source) {
    const { stack, sourceNode, sourceTokens, descriptor, resolver, index, offset } = source;

    debug(`accept (at ${this.format(source)})`);

    this.stack = stack;
    this.sourceNode = sourceNode;
    this.sourceTokens = sourceTokens;
    this.descriptor = descriptor;
    this.resolver = resolver;
    this.index = index;
    this.offset = offset;

    return this;
  }

  reject() {
    debug('reject');
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

  leaveReferences() {
    while (this.nodeDone && this.stack.size) {
      const { sourceNode, sourceTokens, resolver, index } = this.stack.value;
      this.sourceNode = sourceNode;
      this.sourceTokens = sourceTokens;
      this.resolver = resolver;
      this.index = index + 1;

      this.stack = this.stack.pop();
    }
  }

  enterReferences() {
    while (!this.nodeDone && this.token.type === 'Reference') {
      const { sourceNode, sourceTokens, resolver, index, token } = this;
      const child = get(sourceNode, resolver.consume(token.value));
      const childResolver = new Resolver(child);

      validateNode(child);

      this.sourceNode = child;
      this.sourceTokens = child.cstTokens;
      this.resolver = childResolver;
      this.index = 0;

      this.stack = this.stack.push({
        sourceNode,
        sourceTokens,
        resolver,
        index,
      });
    }
  }

  advance(node) {
    const { descriptor, sourceNode, isHoistable } = this;
    const { type, mergeable } = descriptor;

    if (!descriptor) {
      throw new Error('tokensSource.advance cannot be called when no descriptor is active');
    }

    if (this.done) {
      return;
    }

    this.index++;

    if (this.nodeDone) {
      this.leaveReferences();
    } else {
      this.enterReferences();
    }

    const hasNext =
      !this.tokensDone &&
      this.token.type === type &&
      (sourceNode === node || isHoistable(this.token));

    this.offset = mergeable && hasNext ? 0 : null;
  }

  advanceChr(node) {
    const { descriptor } = this;

    if (!descriptor) {
      throw new Error('tokensSource.advanceChr cannot be called when no descriptor is active');
    }

    if (this.token.type === 'Reference') {
      throw new Error('tokensSource.advanceChr cannot consume a reference token');
    }

    this.offset++;

    if (this.offset >= this.token.value.length) {
      this.advance(node);
    }
  }

  format(frame = {}) {
    const { sourceNode = this.sourceNode, index = this.index } = frame;

    return `${sourceNode.type}.cstTokens[${index}]`;
  }
}

module.exports = { TokensSource, TokensSourceFacade };
