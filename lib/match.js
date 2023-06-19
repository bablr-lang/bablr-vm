import { WeakStackFrame } from './utils/object.js';
import { Coroutine } from './coroutine.js';
import * as sym from './symbols.js';

export class Match extends WeakStackFrame {
  constructor(matchers, context, state, instruction) {
    super();

    const { matchable, effects } = instruction;

    this.context = context;
    this.state = new Map(state);
    this.effects = effects;

    const { type: grammar, production } = matchable;

    this.grammar = grammar;

    const matcher = matchers.get(grammar);
    const co = new Coroutine(matcher(context, state.get(grammar), production));

    this.production = production;
    this.coroutine = co;

    // this.precedingToken = state.lastToken;
    // this.finalToken = null;
  }

  static from(matchers, context, state, matchable) {
    const instruction = { effects: { success: sym.none, failure: sym.none }, matchable };

    const match = new Match(matchers, context, state, instruction);

    return match.stack.push(null, match);
  }

  get stack() {
    return this.context.matches;
  }

  get ctx() {
    return this.context;
  }

  get s() {
    return this.engine.state;
  }

  get co() {
    return this.coroutine;
  }

  capture() {
    const { co, state } = this;
    const { context, status } = state;

    this.finalToken = state.lastToken;

    const range = status === sym.rejected ? null : context.getRangeFromMatch(this);

    if (range) context.ranges.set(co, range);

    return range;
  }

  // terminate() {
  //   const { co, state, precedingToken, finalToken, instruction } = this;
  //   const { effects } = instruction;
  //   const empty = !finalToken || precedingToken === finalToken;
  //   const didBranch = !!this.parent && this.parent.state !== this.state;

  //   if (!co.done) {
  //     let caught = false;
  //     try {
  //       co.throw('failure');
  //     } catch (e) {
  //       caught = true;
  //     }
  //     if (!caught) {
  //       throw new Error('Generator attempted to yield a command after failing');
  //     }
  //   }

  //   if (empty && state.status !== sym.rejected) {
  //     state.reject();
  //   }

  //   let { parent } = this;

  //   switch (state.status) {
  //     case sym.active:
  //       if (parent && didBranch) {
  //         if (effects.success === sym.eat) {
  //           parent.state.accept(state);
  //         } else {
  //           this.state.reject();
  //         }
  //       }
  //       break;

  //     case sym.rejected:
  //       if (didBranch) {
  //         while (parent && parent.state === state) {
  //           ({ parent } = parent);
  //         }
  //       }

  //       if (effects.failure === sym.reject) {
  //         parent = parent.terminate();
  //       }
  //       break;

  //     default:
  //       throw new Error();
  //   }

  //   return parent;
  // }
}
