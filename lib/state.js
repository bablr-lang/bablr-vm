import { continue_, evaluateReturn, wait } from '@bablr/agast-helpers/iterable';
import * as BList from '@bablr/agast-helpers/b-list';
import * as BListKeyed from '@bablr/agast-helpers/b-list-keyed';
import { Node, RegexMatcher, StringMatcher } from '@bablr/agast-vm-helpers/symbols';
import { match, guardWithPattern } from './utils/pattern.js';
import { getTreeNodeName, nodeIsComplete } from '@bablr/agast-helpers/path';
import { referenceFromMatcher } from '@bablr/agast-helpers/builders';
import { buildFacadeNode } from './facades.js';
import { freezeRecord, isString } from '@bablr/agast-helpers/object';

export const State = class BABLRState {
  static from(source, context, language, spans) {
    return new State(null, source, context, BList.fromValues([language]), spans);
  }

  #facade;

  constructor(
    parent,
    source,
    context,
    languages,
    spans = BListKeyed.fromValues([]),
    depths = { path: -1, result: -1 },
    returning = BList.fromValues([]),
    holding = BList.fromValues([]),
    heldShift = null,
    heldTrivia = null,
    node = null,
  ) {
    if (!source) throw new Error('invalid args to State');

    this.parent = parent;
    this.source = source;
    this.context = context;
    this.languages = languages;
    this.spans = spans;
    this.depths = depths;
    this.returning = returning;
    this.holding = holding;
    this.heldShift = heldShift;
    this.heldTrivia = heldTrivia;
    this.node = node;

    this.depth = !parent ? 0 : parent.depth + 1;
    this.status = 'active';
  }

  set heldProperty(value) {
    throw new Error('not implemented');
  }

  get resultPath() {
    throw new Error('not implemented');
  }

  get language() {
    return BList.getAt(-1, this.languages);
  }

  get guardedSource() {
    let { source, span } = this;
    let { guard } = span;

    return guard ? guardWithPattern(guard, source) : source;
  }

  get span() {
    return BListKeyed.getAt(-1, this.spans)[1];
  }

  get result() {
    throw new Error();
  }

  get holdingMatch() {
    return BList.getAt(-1, this.heldTrivia) ?? null;
  }

  get speculative() {
    return !!this.parent;
  }

  push(
    source,
    context,
    languages,
    spans,
    resultPath,
    depths,
    returning,
    holding,
    heldShift,
    heldTrivia,
    node,
  ) {
    return new State(
      this,
      source,
      context,
      languages,
      spans,
      resultPath,
      depths,
      returning,
      holding,
      heldShift,
      heldTrivia,
      node,
    );
  }

  getPublic() {
    return (this.#facade ||= freezeRecord({
      languages: () => this.languages,
      span: () => BListKeyed.getAt(-1, this.spans)?.[1],
      spans: () => this.spans,
      depths: () => freezeRecord({ ...this.depths }),
      returning: () => this.returning,
      holding: () => this.holding,
      heldShift: () => this.heldShift,
      heldTrivia: () => this.heldTrivia,
      node: () =>
        buildFacadeNode(referenceFromMatcher(this.propertyMatcher?.refMatcher), this.node),
      source: () =>
        freezeRecord({
          index: this.source.index,
          atGap: this.source.atGap,
          done: this.source.done,
        }),
      status: () => this.status,
    }));
  }

  *guardedMatch(pattern) {
    let { span, source } = this;
    let { guard } = span;

    let branchedSource = false;
    let pattern_ = pattern;

    if (isString(pattern)) {
      throw new Error();
    } else if (pattern.type === StringMatcher) {
      // nothing to do
    } else if (pattern.type === Node) {
      throw new Error();
    } else if (pattern.type === RegexMatcher) {
      // nothing to do
    } else {
      throw new Error();
    }

    let guardedSource = guard ? guardWithPattern(guard, source) : source;

    let result = evaluateReturn(match(pattern_, guardedSource));

    if (result instanceof Promise) {
      result = yield wait(result);
    }

    if (branchedSource) {
      source.release();
    }
    if (guard && !guardedSource.done) {
      let step = guardedSource.return();
      while (step === null || step instanceof Promise) {
        if (step === null) yield continue_(), (step = guardedSource.return());
        if (step instanceof Promise) step = yield wait(step);
      }
    }
    return result;
  }

  match(pattern) {
    return evaluateReturn(match(pattern, this.source));
  }

  branch() {
    let baseState = this;
    let {
      source,
      context,
      spans,
      depths,
      returning,
      holding,
      heldShift,
      heldTrivia,
      node,
      languages,
    } = baseState;

    let child = this.push(
      source.branch(),
      context,
      languages,
      spans,
      { ...depths },
      returning,
      holding,
      heldShift,
      heldTrivia,
      node,
    );

    return child;
  }

  accept() {
    let accepted = this;

    this.status = 'accepted';

    let { parent } = this;

    if (!parent) {
      throw new Error('accepted the root state');
    }

    parent.spans = accepted.spans;
    parent.returning = accepted.returning;
    parent.holding = accepted.holding;
    parent.heldTrivia = accepted.heldTrivia;
    parent.heldShift = accepted.heldShift;
    parent.depths = accepted.depths;
    parent.languages = accepted.languages;

    parent.source.accept(accepted.source);

    return parent;
  }

  reject(finishedMatch) {
    let rejectedState = this;

    let shallower =
      finishedMatch.coveredBoundary.didShift &&
      finishedMatch.coveredBoundary.shiftMatch.state.depth === this.depth - 2
        ? finishedMatch.coveredBoundary.shiftMatch.state
        : this.parent;

    if (this.status === 'rejected') {
      return shallower;
    }

    if (this.status !== 'active') throw new Error();

    this.status = 'rejected';

    if (!shallower) throw new Error('rejected root state');

    rejectedState.source.reject();

    return shallower;
  }
};
