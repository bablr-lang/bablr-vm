import { NodeFacade } from '@bablr/agast-vm';
import emptyStack from '@iter-tools/imm-stack';
import { WeakStackFrame } from '@bablr/weak-stack';
import { getCooked, maybeWait } from '@bablr/agast-helpers/stream';
import { reifyExpression } from '@bablr/agast-vm-helpers';
import { Matcher, Node, Regex, GapTag, ShiftTag } from '@bablr/agast-vm-helpers/symbols';
import { match, guardWithPattern } from './utils/pattern.js';
import { facades, actuals } from './facades.js';

const { freeze } = Object;

export const nodeStates = new WeakMap();

export const StateFacade = class BABLRStateFacade {
  constructor(state) {
    facades.set(state, this);
    freeze(this);
  }

  static from(source) {
    return State.from(actuals.get(source));
  }

  get ctx() {
    return actuals.get(this).context;
  }

  get span() {
    return actuals.get(this).span.name;
  }

  get resultPath() {
    return actuals.get(this).resultPath;
  }

  get result() {
    return actuals.get(this).result;
  }

  get resultFragment() {
    return actuals.get(this).resultFragment;
  }

  get referenceTag() {
    return actuals.get(this).referenceTag;
  }

  get referencePath() {
    return actuals.get(this).referencePath;
  }

  get holding() {
    return actuals.get(this).holding;
  }

  get language() {
    return actuals.get(this).language;
  }

  get depths() {
    const { path, result, shift, nodeShift } = actuals.get(this).depths;
    return { path, result, shift, nodeShift };
  }

  get held() {
    return actuals.get(this).held;
  }

  get node() {
    return actuals.get(this).node;
  }

  get parentNode() {
    return actuals.get(this).parentNode;
  }

  get source() {
    return facades.get(actuals.get(this).source);
  }

  get depth() {
    return actuals.get(this).depth;
  }

  get status() {
    return actuals.get(this).status;
  }

  get parent() {
    return facades.get(actuals.get(this).parent);
  }

  nodeForPath(path) {
    return actuals.get(this).nodeForPath(path);
  }
};

export const State = class BABLRState extends WeakStackFrame {
  constructor(
    parent,
    source,
    context,
    language,
    expressions = emptyStack,
    balanced = emptyStack,
    spans = emptyStack.push({ name: 'Bare' }),
    resultPath = null,
    depths = { path: -1, result: -1, emitted: -1, shift: 0, nodeShift: 0 },
    held = null,
    node = null,
  ) {
    super(parent);

    if (!source) throw new Error('invalid args to State');

    this.source = source;
    this.context = context;
    this.language = language;
    this.expressions = expressions;
    this.balanced = balanced;
    this.spans = spans;
    this.resultPath = resultPath;
    this.depths = depths;
    this.held = held;
    this.node = node;

    this.status = 'active';

    this.emitted = null;

    new StateFacade(this);
  }

  static from(source, context, language, expressions = []) {
    return State.create(
      source,
      context,
      language,
      emptyStack.push(...emptyStack.push(...expressions).valuesReverse()),
    );
  }

  get referencePath() {
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

  get path() {
    throw new Error('not implemented');
  }

  get result() {
    return this.resultPath.tag;
  }

  get resultFragment() {
    let { resultPath, context } = this;
    return new FragmentFacade(
      new NodeFacade(resultPath.propertyWrapper.tag.value.property.node),
      context,
      true,
      false,
    );
  }

  get parentNode() {
    throw new Error('not implemented');
  }

  get holding() {
    return !!this.held;
  }

  get referenceTag() {
    throw new Error('not implemented');
  }

  get referenceTagPath() {
    throw new Error('not implemented');
  }

  get agast() {
    throw new Error('not implemented');
  }

  get isGap() {
    return this.tag.type === GapTag;
  }

  get speculative() {
    return !!this.parent;
  }

  guardedMatch(pattern, attributes = {}) {
    let { span, source } = this;
    let { guard } = span;

    let pattern_ = pattern;
    if (pattern.type === Matcher) {
      let { nodeMatcher, refMatcher } = reifyExpression(pattern.value);
      pattern_ = nodeMatcher;
      if (refMatcher?.type === '#') {
        source = source.branch();
        source.unshift();
      }
      ({ attributes } = pattern_);
    } else if (pattern.type === Regex || pattern.type === Node) {
      pattern_ = pattern.value;
    } else if (typeof pattern !== 'string') {
      throw new Error();
    }

    if (span.type === 'Lexical' && attributes.balancer) {
      // also check that the open node starts a lexical span?
      guard = null;
    }

    if (pattern_?.literalValue) {
      pattern_ = pattern_.literalValue || getCooked(pattern_.tags);

      if (pattern_.type === Symbol.for('String')) {
        pattern_ = reifyExpression(pattern_);
      }
    }

    let guardedSource = guard ? guardWithPattern(guard, source) : source;

    let result = match(pattern_, guardedSource);

    return maybeWait(result, (result) => {
      if (guard && !guardedSource.done) {
        guardedSource.return();
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
      language,
      expressions,
    } = baseState;

    let child = this.push(
      source.branch(),
      context,
      language,
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
    parent.language = accepted.language;
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
