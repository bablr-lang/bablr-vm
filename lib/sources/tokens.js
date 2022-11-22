import emptyStack from '@iter-tools/imm-stack';
import { exec as exec_ } from '@iter-tools/regex';

import { get, freezeSeal } from '../utils/object.js';
import { Resolver } from '../resolver.js';
import { _actual, _chrs } from '../symbols.js';
import { facades } from '../facades.js';

const { isArray } = Array;

export function validateNode(node) {
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

export class TokensSourceFacade {
  constructor(actual) {
    this[_actual] = actual;

    freezeSeal(this);
  }

  static from(node) {
    return new TokensSourceFacade(new TokensSource(node), node);
  }

  get type() {
    return this[_actual].type;
  }

  get index() {
    return this[_actual].chrIndex;
  }

  get done() {
    return this[_actual].done;
  }

  get value() {
    return this[_actual].value;
  }

  get token() {
    return this[_actual].token;
  }

  *peekTokens() {
    let source = this[_actual];

    while (!source.done) {
      yield source.token;
      source = source === this[_actual] ? source.branch(true) : source;
      source.advance(this.node);
    }
  }

  *peekChrs() {
    let source = this[_actual];

    while (!source.done) {
      yield source.value;
      source = source === this[_actual] ? source.branch(true) : source;
      source.advanceChr();
    }
  }

  branch() {
    return new TokensSourceFacade(this[_actual].branch());
  }

  accept(source) {
    this[_actual].accept(source[_actual]);

    return this;
  }

  reject() {
    this[_actual].reject();
  }

  toString() {
    return this[_actual].format();
  }
}

export class TokensSource {
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

    facades.set(this, new TokensSourceFacade(this));

    if (!this.nodeDone && this.token.type === 'Reference') {
      this.enterReferences();
    }
  }

  get type() {
    return 'TokensSource';
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

  *[_chrs]() {
    while (!this.done) {
      yield this.value;
      this.advanceChr();
    }
  }

  exec(pattern) {
    const source = this;
    const { chrIndex } = source;
    const result = exec_(pattern, this[_chrs]())[0] || null;

    // Backtracking the input allows us to avoid having to fork before executing
    // We give back tokens the regex engine consumed but did not match
    while (this.chrIndex > chrIndex + (result ? result.length : 0)) {
      this.advanceChr(true);
    }

    return result;
  }

  testExec(pattern) {
    const source = this;
    const { chrIndex } = source;
    const result = exec_(pattern, this[_chrs]())[0] || null;

    // Backtracking the input allows us to avoid having to fork before executing
    // We give back tokens the regex engine consumed but did not match
    while (this.chrIndex > chrIndex) {
      this.advanceChr(true);
    }

    return result;
  }

  branch(lookahead = false) {
    // prettier-ignore
    const { stack, sourceNode, sourceTokens, descriptor, resolver, index, chrIndex, offset } = this;

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

  reject() {}

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

  advanceChr(backwards = false) {
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
      this.advance(this.node, backwards);
    }
  }

  format(frame = {}) {
    const { sourceNode = this.sourceNode, index = this.index } = frame;

    return `${sourceNode.type}.cstTokens[${index}]`;
  }
}
