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
    this.precedingTag = null;
    this.finalTag = null;
    this.co = null;
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
    return !!this.precedingTag && !!this.finalTag;
  }

  get empty() {
    return this.captured && this.precedingTag === this.finalTag;
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

  capture() {
    const { precedingTag, finalTag, context } = this;
    const { prevTags, nextTags, tagPairs } = context;

    if (precedingTag === finalTag) {
      return null;
    } else {
      let tag = prevTags.get(finalTag);
      let nextTag = finalTag;

      for (;;) {
        if (tagPairs.has(tag)) {
          if (tag.type !== 'CloseTag') {
            nextTags.set(tag, nextTag);
          }

          tag = tagPairs.get(tag);
          nextTag = tag;

          if (tag.type === 'OpenTag') {
            prevTags.delete(tag);
          }

          tag = prevTags.get(tag);
        }

        if (tag === precedingTag) break;

        nextTags.set(tag, nextTag);
        nextTag = tag;
        tag = prevTags.get(tag);
      }

      // The next token after the preceding token will be the initial token
      const initialTag = nextTag;

      tagPairs.set(initialTag, finalTag);
      tagPairs.set(finalTag, initialTag);

      return [initialTag, finalTag];
    }
  }

  terminate() {
    const { state, empty, instruction, co } = this;
    const { effects } = instruction;
    const didBranch = !!this.parent && this.parent.state !== this.state;
    let { status } = state;
    let { parent } = this;

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
