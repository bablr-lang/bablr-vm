import { maybeWait, wait } from '@bablr/agast-helpers/stream';
import * as BList from '@bablr/agast-helpers/b-list';
import * as BMap from '@bablr/agast-helpers/b-map';
import { reifyExpression } from '@bablr/agast-vm-helpers';
import { Regex, TreeNode } from '@bablr/agast-vm-helpers/symbols';
import { match, guardWithPattern } from './utils/pattern.js';
import { nodeIsComplete } from '@bablr/agast-helpers/path';
import { referenceFromMatcher } from '@bablr/agast-helpers/builders';
import { buildFacadeNode } from './facades.js';

let { freeze } = Object;

export const nodeStates = new WeakMap();

export const State = class BABLRState {
  static from(source, context, language, spans) {
    return new State(null, source, context, BList.fromValues([language]), spans);
  }

  constructor(
    parent,
    source,
    context,
    languages,
    spans = BMap.fromValues([]),
    resultPath = null,
    depths = { path: -1, result: -1, emitted: -1, shift: 0, nodeShift: 0 },
    returning = BList.fromValues([]),
    holding = BList.fromValues([]),
    holdingMatches = BList.fromValues([]),
    node = null,
  ) {
    if (!source) throw new Error('invalid args to State');

    this.parent = parent;
    this.source = source;
    this.context = context;
    this.languages = languages;
    this.spans = spans;
    this.resultPath = resultPath;
    this.depths = depths;
    this.returning = returning;
    this.holding = holding;
    this.holdingMatches = holdingMatches;
    this.node = node;

    this.depth = !parent ? 0 : parent.depth + 1;
    this.status = 'active';
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
    return BMap.getAt(-1, this.spans)[1];
  }

  get result() {
    return this.resultPath?.tag;
  }

  get held() {
    return BList.getAt(-1, this.holding)?.node || null;
  }

  get holdingMatch() {
    return BList.getAt(-1, this.holdingMatches) || null;
  }

  get shifted() {
    let { held } = this;

    return held && held.value.type !== Symbol.for('__') ? held : null;
  }

  get speculative() {
    return !!this.parent;
  }

  get canReturnHeld() {
    return this.holdingMatch && !nodeIsComplete(this.holdingMatch.node);
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
    holdingMatches,
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
      holdingMatches,
      node,
    );
  }

  getPublic() {
    let {
      languages,
      spans,
      depths,
      returning,
      holding,
      holdingMatch,
      held,
      canReturnHeld,
      shifted,
      node,
      source,
      result,
      resultPath,
      status,
    } = this;

    return freeze({
      languages,
      span: BMap.getAt(-1, spans)?.[1],
      spans: spans,
      depths: freeze({ ...depths }),
      returning,
      holding,
      holdingMatch: holdingMatch?.getPublic(),
      held,
      canReturnHeld,
      shifted,
      node: buildFacadeNode(referenceFromMatcher(this.propertyMatcher?.refMatcher), node),
      source: freeze({
        index: source.index,
        atGap: source.atGap,
        done: source.done,
      }),
      result,
      resultPath: resultPath?.asPrimitive() || null,
      status,
    });
  }

  *guardedMatch(pattern) {
    let { span, source } = this;
    let { guard } = span;

    let branchedSource = false;
    let pattern_ = pattern;

    if (pattern.type === Regex) {
      pattern_ = pattern.value;
    } else if (pattern.type === TreeNode) {
      if (pattern.value.name === Symbol.for('String')) {
        pattern_ = reifyExpression(pattern);
      } else if (pattern.value.name !== Symbol.for('Pattern')) {
        throw new Error();
      }
    } else if (typeof pattern !== 'string') {
      throw new Error();
    }

    let guardedSource = guard ? guardWithPattern(guard, source) : source;

    let result = match(pattern_, guardedSource);

    if (result instanceof Promise) {
      result = yield wait(result);
    }

    if (branchedSource) {
      source.release();
    }
    if (guard && !guardedSource.done) {
      return maybeWait(guardedSource.return(), () => result);
    }
    return result;
  }

  match(pattern) {
    return match(pattern, this.source);
  }

  branch() {
    let baseState = this;
    let {
      source,
      context,
      spans,
      resultPath,
      depths,
      returning,
      holding,
      holdingMatches,
      node,
      languages,
    } = baseState;

    let child = this.push(
      source.branch(),
      context,
      languages,
      spans,
      resultPath,
      { ...depths },
      returning,
      holding,
      holdingMatches,
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
    parent.holdingMatches = accepted.holdingMatches;
    parent.depths = accepted.depths;
    parent.languages = accepted.languages;

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
