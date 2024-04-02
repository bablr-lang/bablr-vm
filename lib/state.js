import emptyStack from '@iter-tools/imm-stack';
import { WeakStackFrame } from '@bablr/weak-stack';
import { guardWithPattern } from './utils/pattern.js';
import { facades, actuals } from './facades.js';

export const StateFacade = class BABLRStateFacade {
  constructor(state) {
    facades.set(state, this);
  }

  static from(context, source) {
    return State.from(actuals.get(context), actuals.get(source));
  }

  get span() {
    return actuals.get(this).span.name;
  }

  get result() {
    return actuals.get(this).result;
  }

  get context() {
    return facades.get(actuals.get(this).context);
  }

  get path() {
    return actuals.get(this).path;
  }

  get depth() {
    return actuals.get(this).depth;
  }

  get ctx() {
    return this.context;
  }
};

export const State = class BABLRState extends WeakStackFrame {
  constructor(
    context,
    source,
    agast,
    balanced = emptyStack,
    spans = emptyStack.push({ name: 'Bare' }),
  ) {
    super();

    if (!context || !source || !agast) throw new Error('invalid args to State');

    this.context = context;
    this.source = source;
    this.agast = agast;
    this.balanced = balanced;
    this.spans = spans;

    new StateFacade(this);
  }

  static from(context, source, agast) {
    return State.create(context, source, agast);
  }

  get guardedSource() {
    const { source, span } = this;
    const { guard } = span;

    return guard ? guardWithPattern(guard, source) : source;
  }

  get ctx() {
    return this.context;
  }

  get span() {
    return this.spans.value;
  }

  get stack() {
    return this.context.states;
  }

  get path() {
    return this.agast.path;
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
};
