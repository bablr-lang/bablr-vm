import emptyStack from '@iter-tools/imm-stack';
import { WeakStackFrame } from '@bablr/weak-stack';
import { getCooked, maybeWait } from '@bablr/agast-helpers/stream';
import * as BTree from '@bablr/agast-helpers/btree';
import { reifyExpression } from '@bablr/agast-vm-helpers';
import { Matcher, Node, Regex, ShiftTag } from '@bablr/agast-vm-helpers/symbols';
import { match, guardWithPattern } from './utils/pattern.js';
import { getOpenTag } from '@bablr/agast-helpers/path';

export const nodeStates = new WeakMap();

export const State = class BABLRState extends WeakStackFrame {
  constructor(
    parent,
    source,
    context,
    languages,
    expressions = emptyStack,
    balanced = emptyStack,
    spans = emptyStack,
    resultPath = null,
    depths = { path: -1, result: -1, emitted: -1, shift: 0, nodeShift: 0 },
    held = null,
    node = null,
  ) {
    super(parent);

    if (!source) throw new Error('invalid args to State');

    this.source = source;
    this.context = context;
    this.languages = languages;
    this.expressions = expressions;
    this.balanced = balanced;
    this.spans = spans;
    this.resultPath = resultPath;
    this.depths = depths;
    this.held = held;
    this.node = node;

    this.status = 'active';
  }

  static from(source, context, language, expressions = []) {
    return State.create(
      source,
      context,
      BTree.fromValues([language]),
      emptyStack.push(...emptyStack.push(...expressions).valuesReverse()),
    );
  }

  get language() {
    return BTree.getAt(-1, this.languages);
  }

  get referencePath() {
    throw new Error('not implemented');
    let refPath = this.referenceTagPath;

    if (!refPath) return null;

    let { previousSibling } = refPath;
    let isShift = previousSibling.tag.type === ShiftTag;

    let referenceTagPath = previousSibling;

    if (isShift) {
      let refIndex = previousSibling.tagsIndex - 1 - previousSibling.tag.value.index * 3;
      referenceTagPath = previousSibling.siblingAt(refIndex);
    }
    return referenceTagPath;
  }

  get guardedSource() {
    let { source, span } = this;
    let { guard } = span;

    return guard ? guardWithPattern(guard, source) : source;
  }

  get span() {
    return this.spans.value;
  }

  get result() {
    return this.resultPath?.tag;
  }

  get holding() {
    return !!this.held;
  }

  get speculative() {
    return !!this.parent;
  }

  getPublic() {
    let { languages, spans, depths, held, node, source, result, resultPath, status } = this;
    return {
      languages,
      span: spans.value?.name,
      depths: { ...depths },
      holding: !!held,
      held,
      node,
      atGap: source.atGap,
      done: source.done,
      sourceIndex: source.index,
      result,
      resultPath,
      status,
    };
  }

  guardedMatch(pattern, attributes = {}) {
    let { span, source } = this;
    let { guard } = span;

    let branchedSource = false;
    let pattern_ = pattern;
    if (pattern.type === Matcher) {
      let { nodeMatcher } = reifyExpression(pattern.value);

      if (nodeMatcher?.literalValue) {
        pattern_ = nodeMatcher.literalValue; // || getCooked(pattern_.value.tags);
      } else {
        throw new Error();
      }

      ({ attributes } = nodeMatcher);
    } else if (pattern.type === Node) {
      if (!getOpenTag(pattern.value).value.flags.token) throw new Error();

      pattern_ = reifyExpression(pattern.value);
    } else if (pattern.type === Regex) {
      pattern_ = pattern.value;
    } else if (pattern.type !== Matcher && typeof pattern !== 'string') {
      throw new Error();
    }

    let guardedSource = guard ? guardWithPattern(guard, source) : source;

    let result = match(pattern_, guardedSource);

    return maybeWait(result, (result) => {
      if (branchedSource) {
        source.release();
      }
      if (guard && !guardedSource.done) {
        return maybeWait(guardedSource.return(), () => result);
      }
      return result;
    });
  }

  match(pattern) {
    return match(pattern, this.source);
  }

  branch() {
    let baseState = this;
    let {
      source,
      context,
      balanced,
      spans,
      resultPath,
      depths,
      held,
      node,
      languages,
      expressions,
    } = baseState;

    let child = this.push(
      source.branch(),
      context,
      languages,
      expressions,
      balanced,
      spans,
      resultPath,
      { ...depths },
      held,
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
    parent.balanced = accepted.balanced;
    parent.held = accepted.held;
    parent.depths = accepted.depths;
    parent.languages = accepted.languages;
    parent.expressions = accepted.expressions;

    if (parent.depths.result + 1 === accepted.depths.result) {
      parent.resultPath = parent.resultPath.siblingAt(accepted.resultPath.tagsIndex);
    } else {
      parent.resultPath = accepted.resultPath;
    }
    if (!parent.resultPath) throw new Error();

    nodeStates.set(parent.node, nodeStates.get(accepted.node));

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
