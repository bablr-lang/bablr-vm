import { WeakStackFrame } from './utils/object.js';
import { shouldBranch } from './utils/instruction.js';
import * as sym from './symbols.js';
import { active, rejected } from './symbols.js';

export class Match extends WeakStackFrame {
  constructor(context, state, instruction) {
    if (!context || !state || !instruction || !instruction.matchable) throw new Error();

    super();

    this.context = context;
    this.state = state;
    this.instruction = instruction;
    this.co = null;
    this.startTag = null;
    this.endTag = null;
  }

  static from(context, state, matchable) {
    const instruction = { effects: { success: sym.none, failure: sym.none }, matchable };

    const match = new Match(context, state, instruction);

    return match.stack.push(null, match);
  }

  get stack() {
    return this.context.matches;
  }

  get ctx() {
    return this.context;
  }

  get s() {
    return this.state;
  }

  get matchable() {
    return this.instruction.matchable;
  }

  get effects() {
    return this.instruction.effects;
  }

  get grammar() {
    return this.matchable.type;
  }

  get production() {
    return this.matchable.production;
  }

  get captured() {
    return !!this.startTag && !!this.endTag;
  }

  get empty() {
    return this.captured && this.startTag === this.endTag;
  }

  exec(instr) {
    const { ctx, state } = this;
    const { effects } = instr;
    if (shouldBranch(effects)) {
      return this.push(new Match(ctx, state.branch(), instr));
    } else {
      return this.push(new Match(ctx, state, instr));
    }
  }

  terminate() {
    const { state, empty, instruction, co } = this;
    const { effects } = instruction;
    const didBranch = !!this.parent && this.parent.state !== this.state;
    let { status } = state;
    let { parent } = this;

    // TODO
    // This shouldn't be here becuase not all matches have coroutines (is this true)?
    // It kind of needs to be here because it may need to terminate multiple coroutines
    //   i
    co.finalize();

    if (status !== sym.rejected) {
      if (empty || effects.success === sym.reject) {
        state.reject();
        ({ status } = state);
      }
    }

    if (!parent) return null;

    if (status !== active && status !== rejected) throw new Error();

    if (status === active && didBranch) {
      parent.state.accept(state);
    } else if (state.status === rejected && !didBranch) {
      while (parent && parent.state === state) {
        parent.co.finalize();
        ({ parent } = parent);
      }
    }

    return parent;
  }
}
