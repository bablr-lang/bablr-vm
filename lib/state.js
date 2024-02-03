import emptyStack from '@iter-tools/imm-stack';
import { WeakStackFrame } from '@bablr/weak-stack';
import { buildCall } from '@bablr/agast-vm-helpers';
import { facades, actuals } from './utils/facades.js';

export class StateFacade {
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
    return facades.get(actuals.get(this).path);
  }

  get ctx() {
    return this.context;
  }
}

export class State extends WeakStackFrame {
  constructor(
    context,
    source,
    path,
    balanced = emptyStack,
    spans = emptyStack.push({ name: 'Bare' }),
    result = null,
    emitted = null,
  ) {
    super();

    if (!context || !source) throw new Error('invalid args to tagState');

    this.context = context;
    this.source = source;
    this.path = path;
    this.balanced = balanced;
    this.spans = spans;
    this.result = result;
    this.emitted = emitted;

    new StateFacade(this);
  }

  static from(context, source) {
    return State.create(context, source, null);
  }

  *emit(terminal) {
    const { prevTerminals, nextTerminals, tagPaths } = this.context;

    if (terminal) {
      const cookedValue = terminal.type === 'Escape' ? terminal.value.cooked : terminal.value;

      if (terminal.value && /\r|\n/.test(cookedValue) && !/^\r|\r\n|\n$/.test(cookedValue)) {
        throw new Error('Invalid LineBreak token');
      }

      if (prevTerminals.has(terminal)) {
        throw new Error('Double emit');
      }

      if (
        this.result?.type === 'ReferenceTag' &&
        !['OpenNodeTag', 'Null'].includes(terminal.type)
      ) {
        throw new Error('Bad reference emit');
      }

      prevTerminals.set(terminal, this.result);
      if (this.result) {
        nextTerminals.set(this.result, terminal);
      }

      this.result = terminal;
    }

    if (!this.emitted && terminal) {
      if (terminal.type !== 'OpenFragmentTag') throw new Error();
      this.emitted = terminal;
      yield buildCall('emit', terminal);
    }

    if (this.depth === 0) {
      let emittable = nextTerminals.get(this.emitted);

      while (
        emittable &&
        !(emittable.type === 'OpenNodeTag' && tagPaths.get(emittable).unboundAttributes?.size)
      ) {
        yield buildCall('emit', emittable);
        this.emitted = emittable;
        emittable = nextTerminals.get(this.emitted);
      }
    }

    return terminal;
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

  get isGap() {
    return this.tag.type === 'NodeGapTag';
  }

  get speculative() {
    return !!this.parent;
  }
}
