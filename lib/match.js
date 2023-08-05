import { WeakStackFrame } from './utils/object.js';
import { shouldBranch, buildProps } from './utils/instruction.js';
import * as sym from './symbols.js';
import { Coroutine } from './coroutine.js';
import { active, rejected } from './symbols.js';

const getGrammarType = (matchable) => {
  switch (matchable.type) {
    case 'TokenTag':
      return sym.token;
    case 'GapTag':
      return sym.node;
    default:
      throw new Error();
  }
};

export class Match extends WeakStackFrame {
  constructor(context, state, instruction, co) {
    if (
      !context ||
      !state ||
      !instruction ||
      !instruction.effects ||
      !instruction.matchable ||
      !co
    ) {
      throw new Error('Invalid arguments to Match constructor');
    }

    super();

    this.context = context;
    this.state = state;
    this.instruction = instruction;
    this.co = co;
    this.precedingTag = null;
    this.finalTag = null;
  }

  static from(context, state, matchable) {
    const instr = { effects: { success: sym.none, failure: sym.none }, matchable };
    const { grammars } = context;

    const tag = matchable.value;
    const grammar = grammars.get(getGrammarType(matchable));

    const co = new Coroutine(grammar.get(tag.type).value(buildProps(context, matchable, state)));

    const match = new Match(context, state, instr, co);

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

  get tag() {
    return this.matchable.value;
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

  exec(instr) {
    const { ctx, state } = this;
    const { effects, matchable } = instr;
    const tag = matchable.value;
    const { grammars } = ctx;
    const grammar = grammars.get(getGrammarType(matchable));
    const nextState = matchable.type === 'TokenTag' ? state.chrState : state;

    const co = new Coroutine(
      grammar
        .get(tag.type)
        .value(
          buildProps(
            ctx,
            matchable,
            shouldBranch(effects) ? nextState.branch() : nextState,
            tag.attrs,
          ),
        ),
    );

    return this.push(new Match(ctx, nextState, instr, co));
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
