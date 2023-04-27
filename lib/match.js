import { WeakStackFrame } from './utils/object.js';
import { facades } from './utils/facades.js';
import { Coroutine } from './coroutine.js';
import * as sym from './symbols.js';

const getProductionType = (matchable) => {
  // production.type access is polymorphic over matchable.type!
  return matchable.value.type;
};

export class Match extends WeakStackFrame {
  constructor(context, state, coroutine, instruction) {
    super();

    this.context = context;
    this.state = state;
    this.coroutine = coroutine;
    this.instruction = instruction;

    this.precedingToken = state.lastToken;
    this.finalToken = null;
  }

  static from(context, state, matchable, props, resolveType = (t) => t) {
    const { grammars } = context;
    const instruction = { successEffect: sym.none, failureEffect: sym.none, matchable };
    const type = resolveType(getProductionType(matchable));
    const grammar = grammars.get(matchable.type);

    const coroutine = Coroutine.from(grammar, type, {
      context: facades.get(context),
      state: facades.get(state),
      ...props,
    });

    const match = new Match(context, state, coroutine, instruction);

    return match.stack.push(null, match);
  }

  get type() {
    return this.coroutine.type;
  }

  get stack() {
    return this.context.matches;
  }

  get speculative() {
    return this.stack.depth(this) > 0;
  }

  get ctx() {
    return this.context;
  }

  get s() {
    return this.state;
  }

  get co() {
    return this.coroutine;
  }

  exec(instruction, props, resolveType = (t) => t) {
    const { state } = this;
    const { successEffect, failureEffect, matchable } = instruction;
    const { context } = state;
    const { grammars } = context;
    const grammar = grammars.get(matchable.type);
    const shouldBranch = successEffect === sym.none || failureEffect === sym.none;

    const nextState = shouldBranch ? state.branch() : state;

    const coroutine = Coroutine.from(grammar, resolveType(getProductionType(matchable)), {
      context: facades.get(context),
      state: facades.get(nextState),
      ...props,
    });

    return this.push(new Match(context, nextState, coroutine, instruction));
  }

  capture() {
    const { co, state } = this;
    const { context, status } = state;

    this.finalToken = state.lastToken;

    const range = status === sym.rejected ? null : context.getRangeFromMatch(this);

    if (range) context.ranges.set(co, range);

    return range;
  }

  terminate() {
    const { co, state, precedingToken, finalToken, instruction } = this;
    const { successEffect, failureEffect } = instruction;
    const empty = !finalToken || precedingToken === finalToken;
    const didBranch = !!this.parent && this.parent.state !== this.state;

    if (!co.done) {
      let caught = false;
      try {
        co.throw('failure');
      } catch (e) {
        caught = true;
      }
      if (!caught) {
        throw new Error('Generator attempted to yield a command after failing');
      }
    }

    if (empty && state.status !== sym.rejected) {
      state.reject();
    }

    let { parent } = this;

    switch (state.status) {
      case sym.active:
        if (parent && didBranch) {
          if (successEffect === sym.eat) {
            parent.state.accept(state);
          } else {
            this.state.reject();
          }
        }
        break;

      case sym.rejected:
        if (didBranch) {
          while (parent && parent.state === state) {
            ({ parent } = parent);
          }
        }

        if (failureEffect === sym.fail) {
          parent = parent.terminate();
        }
        break;

      default:
        throw new Error();
    }

    return parent;
  }
}
