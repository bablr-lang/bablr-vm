import { WeakStackFrame } from './utils/object.js';
import { Production } from './production.js';
import * as sym from './symbols.js';

export class Match extends WeakStackFrame {
  constructor(context, state, instruction) {
    super();

    this.context = context;
    this.state = state;

    const { matchable, effects } = instruction;

    this.effects = effects;
    this.production = Production.from(context, matchable);

    // Abstract this out to middleware or something?
    this.precedingToken = state.lastToken;
    this.finalToken = null;
  }

  static from(context, state, matchable) {
    const instruction = { effects: { success: sym.none, failure: sym.none }, matchable };

    const match = new Match(context, state, instruction);

    return match.stack.push(null, match);
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
    return this.engine.state;
  }

  get co() {
    return this.coroutine;
  }

  // exec(instruction, props, resolveType = (t) => t) {
  //   const { state } = this;
  //   const { effects, matchable } = instruction;
  //   const { context } = state;
  //   const { grammars } = context;
  //   const grammar = grammars.get(matchable.type);
  //   const shouldBranch = effects.success === sym.none || effects.failure === sym.none;

  //   const nextState = shouldBranch ? state.branch() : state;

  //   const coroutine = Coroutine.from(grammar, resolveType(matchable.production.type), {
  //     context: facades.get(context),
  //     state: facades.get(nextState),
  //     ...props,
  //   });

  //   return this.push(new Match(context, nextState, coroutine, instruction));
  // }

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
