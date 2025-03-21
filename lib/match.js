import { resolveLanguage } from '@bablr/helpers/grammar';
import { WeakStackFrame } from '@bablr/weak-stack';

import { allTagsFor, getChildPropertyIndex, Path, TagPath } from '@bablr/agast-helpers/path';
import { isEmpty } from '@bablr/agast-helpers/stream';
import * as sumtree from '@bablr/agast-helpers/sumtree';
import { buildGapTag, buildReferenceTag, mergeReferences } from '@bablr/agast-helpers/tree';
import { effectsFor, shouldBranch } from '@bablr/agast-vm-helpers';
import { buildInternalState, internalStates, FragmentFacade } from './node.js';

import { facades, actuals } from './facades.js';
import { CloseNodeTag, GapTag, OpenNodeTag, ShiftTag } from '@bablr/agast-helpers/symbols';
import { nodeStates } from './state.js';
import { buildCall, buildEmbeddedTag } from '@bablr/agast-vm-helpers/builders';

const nodeTopType = Symbol.for('@bablr/node');

const tagPathsAreEqual = (a, b) => {
  return !a || !b ? a == b : a.path.node === b.path.node && a.childrenIndex === b.childrenIndex;
};

export class MatchFacade {
  constructor(match) {
    facades.set(match, this);
  }

  get language() {
    return actuals.get(this).language;
  }

  get matcher() {
    return actuals.get(this).matcher;
  }

  get mergedReference() {
    return actuals.get(this).mergedReference;
  }

  get propertyMatcher() {
    return actuals.get(this).propertyMatcher;
  }

  get depth() {
    return actuals.get(this).depth;
  }

  get path() {
    return actuals.get(this).path;
  }

  get innerPath() {
    return actuals.get(this).innerPath;
  }

  get fragment() {
    const {
      ctx,
      path,
      isNode,
      fragmentNode,
      mergedReference,
      rangePreviousIndex,
      rangeFinalIndex,
    } = actuals.get(this);

    const { name, isArray } = mergedReference.value;

    if (isNode && !['#', '@'].includes(name)) {
      return new FragmentFacade(
        fragmentNode,
        ctx,
        false,
        true,
        [rangePreviousIndex + 1, rangeFinalIndex],
        mergedReference,
        isArray ? getChildPropertyIndex(fragmentNode, rangePreviousIndex + 1) : null,
      );
    } else {
      return new FragmentFacade(fragmentNode, ctx, false, true, [
        rangePreviousIndex + 1,
        rangeFinalIndex,
      ]);
    }
  }

  get pathDepth() {
    return actuals.get(this).depths.path;
  }

  get pathName() {
    return actuals.get(this).pathName;
  }

  get pathParent() {
    return actuals.get(this).pathParent;
  }

  get node() {
    const { node, ctx } = actuals.get(this);
    return FragmentFacade.wrap(node, ctx, false);
  }

  get props() {
    return actuals.get(this).props;
  }

  get type() {
    return actuals.get(this).type;
  }

  get isNode() {
    return actuals.get(this).isNode;
  }

  get isCover() {
    return actuals.get(this).isCover;
  }

  get didShift() {
    return actuals.get(this).didShift;
  }

  get isCoverBoundary() {
    return actuals.get(this).isCoverBoundary;
  }

  get cover() {
    return facades.get(actuals.get(this).cover);
  }

  get shiftMatch() {
    return facades.get(actuals.get(this).shiftMatch);
  }

  get captured() {
    return actuals.get(this).captured;
  }

  get range() {
    return actuals.get(this).range;
  }

  get effects() {
    return actuals.get(this).effects;
  }

  get parent() {
    return facades.get(actuals.get(this).parent);
  }

  get grammar() {
    return actuals.get(this).grammar;
  }

  get state() {
    return facades.get(actuals.get(this).state);
  }

  get s() {
    return facades.get(actuals.get(this).s);
  }

  get rangePrevious() {
    return actuals.get(this).rangePrevious;
  }

  get rangePreviousIndex() {
    return actuals.get(this).rangePreviousIndex;
  }

  get rangeInitial() {
    return actuals.get(this).rangeInitial;
  }

  get rangeFinal() {
    return actuals.get(this).rangeFinal;
  }

  get rangeFinalIndex() {
    return actuals.get(this).rangeFinalIndex;
  }

  ancestors(...args) {
    return actuals.get(this).ancestors(...args);
  }
}

export class Match extends WeakStackFrame {
  constructor(
    parent,
    context,
    language,
    state,
    matcher,
    effects,
    shiftMatch = null,
    suppressNode = false,
  ) {
    if (!context || !language || !state) {
      throw new Error('Invalid arguments to Match constructor');
    }

    super(parent);

    this.context = context;
    this.language = language;
    this.state = shouldBranch(effects) ? state.branch() : state;
    this.propertyMatcher = matcher;
    this.effects = effects;
    this.shiftMatch = shiftMatch;

    this.rangePreviousIndex = null;
    this.rangeFinalIndex = null;
    this.node = null;
    this.fragmentNode = null; // why do it this way?
    this.cover = null;
    this.suppressNode = suppressNode;

    let internalState;
    let { isNode } = this;
    const { grammar, type } = this;
    let isCover = grammar.covers?.has(type);

    this.cover = isNode ? null : parent?.cover || (isCover ? this : null);

    let shouldConstructNode = (isNode && !parent.isCover) || isCover || !parent;

    if (shouldConstructNode) {
      internalState = buildInternalState();
      internalState.path.node;
    } else {
      const { instructionsPump, expressionsPump, agastState, agast, path } = internalStates.get(
        parent.node,
      );
      internalState = { instructionsPump, expressionsPump, agastState, agast, path };
    }

    this.node = internalState.path.node;

    if (this.isNode) {
      this.node.type = Symbol.for(this.type);
      this.node.language = this.language.canonicalURL;
    }

    internalStates.set(this.node, internalState);

    new MatchFacade(this);
  }

  static from(context, language, state, matcher, props, suppressNode) {
    return Match.create(context, language, state, matcher, effectsFor('eat'), props, suppressNode);
  }

  get isCoverBoundary() {
    return (this.isNode && !this.parent.cover) || this.cover === this;
  }

  get matcher() {
    return this.propertyMatcher?.nodeMatcher;
  }

  get mergedReference() {
    let ref = buildReferenceTag('.');

    let first = true;
    let m = this;
    do {
      if (m.isNode && !first) break;
      if (m.propertyMatcher.refMatcher) {
        const { name, isArray, flags } = m.propertyMatcher.refMatcher;
        const parentRef = buildReferenceTag(name, isArray, flags);
        ref = ['#', '@'].includes(ref.value.name) ? ref : mergeReferences(ref, parentRef);
      }
      first = false;
    } while ((m = m.shiftMatch || m.parent));

    return ref;
  }

  get pathName() {
    return this.mergedReference.value.name;
  }

  get path() {
    let { agastState } = internalStates.get(this.fragmentNode || this.node);
    return agastState.path || agastState.resultPath.path;
  }

  get pathParent() {
    let m = this;

    do {
      m = m.parent;
    } while (m && !m.isNode);
    return m;
  }

  get coveredBoundary() {
    return this.isNode ? this.parent.cover || this : this.cover || this;
  }

  get parentPath() {
    return this.pathParent?.path;
  }

  get ctx() {
    return this.context;
  }

  get grammar() {
    return this.context.grammars.get(this.language);
  }

  get s() {
    return this.state;
  }

  get type() {
    return this.matcher?.type || null;
  }

  get flags() {
    return this.matcher?.flags;
  }

  get captured() {
    return !this.rangePrevious || !!this.rangeFinal;
  }

  get allowEmpty() {
    return !!this.grammar.emptyables?.has(this.type);
  }

  get rangePrevious() {
    return this.rangePreviousIndex == null ? null : new TagPath(this.path, this.rangePreviousIndex);
  }

  setRangePreviousIndex(value) {
    this.rangePreviousIndex = value;
    this.rangePrevious;
  }

  setRangeFinalIndex(value) {
    this.rangeFinalIndex = value;
    this.rangeFinal;
  }

  get rangeFinal() {
    const path = Path.from(this.fragmentNode || this.node);

    return this.rangeFinalIndex == null ? null : new TagPath(path, this.rangeFinalIndex);
  }

  get rangeInitial() {
    const { rangePrevious } = this;

    if (!rangePrevious) return rangePrevious;

    return rangePrevious?.nextSibling;
  }

  get range() {
    const { rangeInitial, rangeFinal } = this;
    return rangeInitial === null ? null : [rangeInitial, rangeFinal];
  }

  get didShift() {
    return !!this.shiftMatch;
  }

  get referencePath() {
    const previous = this.rangePrevious;

    if (!this.isNode) {
      return null;
    }

    if (this.parent.cover) {
      return previous.nextSibling;
    }

    if (this.didShift) {
      let tagPath = previous;
      while ([GapTag, ShiftTag].includes(tagPath.tag.type)) {
        tagPath = tagPath.previousSibling;
      }
      return tagPath;
    }

    return previous.nextSibling;
  }

  get isNode() {
    const { grammar, type } = this;
    return !this.suppressNode && grammar.covers?.get(nodeTopType).has(type);
  }

  get isCover() {
    return this.cover === this;
  }

  get innerPath() {
    return internalStates.get(this.node).path;
  }

  add(node) {
    let internalState = internalStates.get(this.fragmentNode);
    const { expressionsPump, instructionsPump, agast, agastState } = internalState;

    expressionsPump.queue(node);
    instructionsPump.queue(buildCall('advance', buildEmbeddedTag(buildGapTag())));

    agast.next();
  }

  startFrame(state, propertyMatcher, effects, didShift, suppressNode) {
    let { context } = this;
    const { nodeMatcher } = propertyMatcher;

    const language = resolveLanguage(context, this.language, nodeMatcher.language);

    if (!language) {
      throw new Error(`Unknown language ${nodeMatcher.language.join('.')}`);
    }

    return this.push(context, language, state, propertyMatcher, effects, didShift, suppressNode);
  }

  endFrame() {
    const finishedMatch = this;
    const m = finishedMatch.parent;
    let finishedState = finishedMatch.state;

    // if (
    //   finishedMatch.isNode &&
    //   finishedState.status !== 'rejected' &&
    //   !getCloseTag(finishedMatch.node)
    // )
    //   throw new Error();

    if (!m) return m;

    if (finishedState !== m.state) {
      if (
        (!isEmpty(allTagsFor(finishedMatch.range)) || finishedMatch.allowEmpty) &&
        finishedMatch.state.status !== 'rejected'
      ) {
        finishedState.accept();
        finishedMatch.setRangeFinalIndex(sumtree.getSize(finishedMatch.fragmentNode.children) - 1);
      } else {
        finishedState.reject();
        finishedMatch.setRangePreviousIndex(null);
      }
    } else {
      finishedMatch.setRangeFinalIndex(
        sumtree.getSize((finishedMatch.fragmentNode || m.node).children) - 1,
      );
    }

    return m;
  }

  *emit() {
    let { state } = this;

    if (!state.depth) {
      let { node, emitted } = state;

      let { path } = internalStates.get(node);

      let tagPath = emitted || (sumtree.getSize(path.node.children) ? new TagPath(path, 0) : null);

      // two basic cases:
      //   emitted can move
      //   emitted cannot move

      while (tagPath) {
        if (
          tagPath.tag.type === OpenNodeTag &&
          tagPath.tag.value.type &&
          nodeStates.get(tagPath.path.node)?.unboundAttributes?.size
        ) {
          break;
        }

        if (!tagPathsAreEqual(tagPath, state.emitted)) {
          state.emitted = emitted = tagPath;

          if (tagPath.tag.type === OpenNodeTag) {
            state.depths.emitted++;
          } else if (tagPath.tag.type === CloseNodeTag) {
            state.depths.emitted--;
          }

          yield tagPath.tag;
        }

        tagPath = emitted.next;
      }
    }
  }
}
