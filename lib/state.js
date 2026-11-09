import { continue_, evaluateReturn, wait } from '@bablr/agast-helpers/iterable';
import * as BList from '@bablr/agast-helpers/b-list';
import * as BListKeyed from '@bablr/agast-helpers/b-list-keyed';
import * as Tags from '@bablr/agast-helpers/tags';
import { Node, RegexMatcher, StringMatcher } from '@bablr/agast-vm-helpers/symbols';
import { match, guardWithPattern } from './utils/pattern.js';
import { buildFacadeNode } from './facades.js';
import { freezeRecord, isString } from '@bablr/agast-helpers/object';
import {
  BindingTag,
  GapTag,
  HashTag,
  LiteralTag,
  NullTag,
  OpenTag,
  printTag,
  parseTag,
  parseTagType,
  Property,
  ReferenceTag,
  SumsTag,
  GapNode,
  NullNode,
  TreeNode,
} from 'agast';
import { getRootProperty, isCoverNode, Path, propertyIsFull } from '@bablr/agast-helpers/path';

let indexForTag = (tag) => {
  switch (parseTagType(tag)) {
    case ReferenceTag:
      return 0;
    case BindingTag:
      return 1;
    case HashTag:
      return 2;
    case SumsTag:
      return 3;
    case OpenTag:
    case NullTag:
    case GapTag:
    case TreeNode:
    case NullNode:
    case GapNode:
      return 4;
  }
};

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
    didShift = false,
    heldShift = null,
    heldTrivia = null,
    matchResults = BList.fromValues([]),
    finishedNode = null,
  ) {
    if (!source) throw new Error('invalid args to State');

    this.parent = parent;
    this.source = source;
    this.context = context;
    this.languages = languages;
    this.spans = spans;
    this.depths = depths;
    this.returning = returning;
    this.didShift = didShift;
    this.heldShift = heldShift;
    this.heldTrivia = heldTrivia;
    this.matchResults = matchResults;
    this.finishedNode = finishedNode;

    this.depth = !parent ? 0 : parent.depth + 1;
    this.status = 'active';
  }

  set node(_) {
    throw new Error('not implemented');
  }

  get node() {
    let path = BList.getAt(-1, this.matchResults);

    return path.node;
  }

  get rootNode() {
    throw new Error('deprecated');
    let path = BList.getAt(-1, this.matchResults);

    return path.atDepth(0).node;
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
    return BList.getAt(-1, this.matchResults);
  }

  set result(result) {
    this.matchResults = BList.replaceAt(-1, result, this.matchResults);
  }

  get holdingMatch() {
    return BList.getAt(-1, this.heldTrivia) ?? null;
  }

  get speculative() {
    return !!this.parent;
  }

  advance(tag) {
    let tagType = parseTagType(tag);

    let { heldTrivia } = this;

    /*
      what to do when the held property is full?

      */

    if (heldTrivia && propertyIsFull(heldTrivia)) {
      this.result = Path.advance(this.result, tag);
    } else if (heldTrivia != null && tagType === Property) {
      heldTrivia = tag;
    } else if (heldTrivia != null) {
      let startsEmpty = !heldTrivia || heldTrivia === '';

      if (heldTrivia === '') {
        heldTrivia = null;
      }

      heldTrivia ??= Tags.fromValues([tagType === ReferenceTag ? tag : '']);
      if (heldTrivia.length !== 5) {
        while (heldTrivia.length < indexForTag(tag)) {
          heldTrivia = Tags.push('', heldTrivia);
        }

        if (!startsEmpty) {
          let tag_ = parseTag(tag);
          if (tag_.type === OpenTag) {
            if (!tag_.value.selfClosing) throw new Error();
            tag_ = Tags.from(printTag(tag_, { porcelain: true }));
          } else if ([TreeNode, NullNode, GapNode].includes(tag_.type)) {
            tag_ = tag_.value;
          } else {
            tag_ = printTag(tag_);
          }

          heldTrivia = Tags.push(tag_, heldTrivia);
        }
      } else if (
        tagType === LiteralTag ||
        (tagType === OpenTag && parseTag(tag).value.literalValue)
      ) {
        throw new Error('cannot advance while holding');
      }
    } else {
      this.result = Path.advance(this.result, tag);
    }

    this.heldTrivia = heldTrivia;
  }

  push(...args) {
    return new State(this, ...args);
  }

  getPublic() {
    return (this.#facade ||= freezeRecord({
      languages: () => this.languages,
      span: () => BListKeyed.getAt(-1, this.spans)?.[1],
      spans: () => this.spans,
      depths: () => freezeRecord({ ...this.depths }),
      returning: () => this.returning,
      heldShift: () => this.heldShift,
      heldTrivia: () => this.heldTrivia,
      node: () =>
        buildFacadeNode(isCoverNode(this.node) ? getRootProperty(this.node)?.[4] : this.node),
      finishedNode: () => this.finishedNode,
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
      didShift,
      heldShift,
      heldTrivia,
      matchResults,
      finishedNode,
      languages,
    } = baseState;

    let child = this.push(
      source.branch(),
      context,
      languages,
      spans,
      { ...depths },
      returning,
      didShift,
      heldShift,
      heldTrivia,
      matchResults,
      finishedNode,
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
    parent.didShift = accepted.didShift;
    parent.heldTrivia = accepted.heldTrivia;
    parent.heldShift = accepted.heldShift;
    parent.depths = accepted.depths;
    parent.languages = accepted.languages;
    parent.matchResults = accepted.matchResults;
    parent.finishedNode = accepted.finishedNode;

    parent.source.accept(accepted.source);

    return parent;
  }

  reject(finishedMatch) {
    let rejectedState = this;

    if (this.status === 'rejected') {
      return this;
    }

    let shallower =
      finishedMatch.coveredBoundary.didShift &&
      finishedMatch.coveredBoundary.shiftMatch.state.depth === this.depth - 2
        ? finishedMatch.coveredBoundary.shiftMatch.state
        : this.parent;

    if (this.status !== 'active') throw new Error();

    this.status = 'rejected';

    if (!shallower) throw new Error('rejected root state');

    rejectedState.source.reject();

    return shallower;
  }
};
