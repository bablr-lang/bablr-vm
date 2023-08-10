import { WeakStackFrame } from './utils/object.js';
import { buildProps, shouldBranch } from './utils/instruction.js';
import * as sym from './symbols.js';
import { Coroutine } from './coroutine.js';
import { active, rejected } from './symbols.js';

export const getGrammarType = (matchable) => {
  switch (matchable.type) {
    case 'GapTokenTag':
      return sym.token;
    case 'GapNodeTag':
      return sym.node;
    default:
      throw new Error();
  }
};

export class Match extends WeakStackFrame {
  constructor(context, state, instr, co) {
    if (!context || !state || !instr || !instr.effects || !instr.matchable || !co) {
      throw new Error('Invalid arguments to Match constructor');
    }

    super();

    const grammarType = getGrammarType(instr.matchable);

    this.context = context;
    this.state = state;
    this.instr = instr;
    this.co = co;
    this.precedingTag = grammarType === sym.node ? state.chrState.result : state.result;
    this.finalTag = null;
  }

  static from(context, state, matchable) {
    const { grammars } = context;

    const instruction = { effects: { success: sym.eat, failure: sym.none }, matchable };
    const tag = matchable.value;
    const grammar = grammars.get(getGrammarType(matchable));

    const co = new Coroutine(grammar.get(tag.type).value(buildProps(context, matchable, state)));

    const match = new Match(context, state, instruction, co);

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

  get effects() {
    return this.instr.effects;
  }

  get matchable() {
    return this.instr.matchable;
  }

  get tagType() {
    return this.matchable.value.type;
  }

  get grammarType() {
    return getGrammarType(this.matchable);
  }

  get grammar() {
    const { grammars } = this.context;
    return grammars.get(this.grammarType);
  }

  get captured() {
    return !!this.precedingTag && !!this.finalTag;
  }

  get empty() {
    return this.captured && this.precedingTag === this.finalTag;
  }

  exec(instruction, state) {
    const { ctx, grammarType } = this;
    const { matchable, effects } = instruction;
    const tag = matchable.value;
    const { grammars } = ctx;
    const grammar = grammars.get(getGrammarType(matchable));
    let scopedState =
      grammarType === sym.node && matchable.type === 'GapTokenTag' ? state.chrState : state;
    const nextState = shouldBranch(effects) ? scopedState.branch() : scopedState;

    const co = new Coroutine(
      grammar.get(tag.type).value(buildProps(ctx, matchable, nextState, tag.attrs)),
    );

    return this.push(new Match(ctx, nextState, instruction, co));
  }

  capture() {
    const { precedingTag, context, state } = this;
    const { prevTags, nextTags, tagPairs } = context;
    const finalTag = state.result;

    this.finalTag = finalTag;

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
    const { state, empty, instr, co } = this;
    const { effects } = instr;
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
      if (parent.grammarType === sym.node && this.grammarType === sym.token) {
        parent.state.chrState.accept(state);
      } else {
        parent.state.accept(state);
      }
    } else if (state.status === rejected && !didBranch) {
      while (parent && parent.state === state) {
        parent.co.finalize();
        ({ parent } = parent);
      }
    }

    parent.state.status = sym.active;

    return parent;
  }
}
