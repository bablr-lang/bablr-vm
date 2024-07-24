import emptyStack from '@iter-tools/imm-stack';
import { WeakStackFrame } from '@bablr/weak-stack';
import { getCooked } from '@bablr/agast-helpers/stream';
import { match, guardWithPattern } from './utils/pattern.js';
import { facades, actuals } from './facades.js';

export const StateFacade = class BABLRStateFacade {
  constructor(state) {
    facades.set(state, this);
  }

  static from(source) {
    return State.from(actuals.get(source));
  }

  get span() {
    return actuals.get(this).span.name;
  }

  get result() {
    return actuals.get(this).result;
  }

  get holding() {
    return actuals.get(this).holding;
  }

  get path() {
    return actuals.get(this).path;
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
};

export const State = class BABLRState extends WeakStackFrame {
  constructor(source, agast, balanced = emptyStack, spans = emptyStack.push({ name: 'Bare' })) {
    super();

    if (!source || !agast) throw new Error('invalid args to State');

    this.source = source;
    this.agast = agast;
    this.balanced = balanced;
    this.spans = spans;

    this.status = 'active';

    new StateFacade(this);
  }

  static from(source, agast) {
    return State.create(source, agast);
  }

  get guardedSource() {
    const { source, span } = this;
    const { guard } = span;

    return guard ? guardWithPattern(guard, source) : source;
  }

  get span() {
    return this.spans.value;
  }

  get path() {
    return this.agast.path;
  }

  get node() {
    return this.agast.node;
  }

  get parentNode() {
    return this.agast.parentNode;
  }

  get holding() {
    return this.agast.holding;
  }

  get result() {
    return this.agast.result;
  }

  get isGap() {
    return this.tag.type === 'NodeGapTag';
  }

  get speculative() {
    return !!this.parent;
  }

  guardedMatch(pattern) {
    let { span, spans, source } = this;
    let { guard } = span;

    if (pattern?.intrinsicValue) {
      // if (pattern.type === 'OpenNodeTag') {

      //   // TODO differntiate better between self-closing tags and matchers
      //   pattern = pattern.value;
      // }

      ({ guard } = span);

      if (span.type === 'Lexical' && pattern.attributes.balancer) {
        // also check that the open node starts a lexical span?
        span = spans.prev.value;
        ({ guard } = span);
      }

      pattern = pattern.intrinsicValue || getCooked(pattern.children);
    }

    return match(pattern, guard ? guardWithPattern(guard, source) : source);
  }
};
