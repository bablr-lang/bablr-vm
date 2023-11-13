import { WeakStackFrame } from './utils/object.js';
import { buildArgs, buildExpression, shouldBranch } from './utils/instruction.js';
import { getCooked } from './utils/token.js';
import * as sym from './symbols.js';
import { Coroutine } from './coroutine.js';
import { active, rejected } from './symbols.js';

const { getPrototypeOf } = Object;

export class Match extends WeakStackFrame {
  constructor(context, state, matchable, effects, co) {
    if (!context || !state || !matchable || !effects || !co) {
      throw new Error('Invalid arguments to Match constructor');
    }

    super();

    this.context = context;
    this.state = state;
    this.matchable = matchable;
    this.effects = effects;
    this.co = co;
    this.precedingTag = state.result;
    this.finalTag = null;
  }

  static from(context, state, matchable, props) {
    const { grammar } = context;

    const effects = { success: sym.eat, failure: sym.none };
    const args = buildArgs(buildExpression(props), state, context);

    const co = new Coroutine(
      getPrototypeOf(grammar)[getCooked(matchable.properties.type)].apply(grammar, args),
    );

    const match = new Match(context, state, matchable, effects, co);

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

  get type() {
    return this.matchable.type;
  }

  get grammar() {
    return this.context.grammar;
  }

  get captured() {
    return !!this.precedingTag && !!this.finalTag;
  }

  get empty() {
    return this.captured && this.precedingTag === this.finalTag;
  }

  exec(matchable, effects, props) {
    const { ctx, state } = this;
    const { grammar } = ctx;

    const nextState = shouldBranch(effects) ? state.branch() : state;
    const args = buildArgs(buildExpression(props), nextState, ctx);

    const co = new Coroutine(
      // type may be Language:Type
      getPrototypeOf(grammar)[getCooked(matchable.properties.type)].apply(grammar, args),
    );

    return this.push(new Match(ctx, nextState, matchable, effects, co));
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
    const { state, empty, effects, co } = this;
    const didBranch = !!this.parent && this.parent.state !== this.state;
    let { status } = state;
    let { parent } = this;

    co.finalize();

    if (status !== sym.rejected) {
      if (empty || effects.success === sym.fail) {
        state.reject();
        ({ status } = state);
      }
    }

    if (!parent) return null;

    if (status !== active && status !== rejected) throw new Error();

    if (status === rejected && !didBranch) {
      while (parent && parent.state === state) {
        parent.co.finalize();
        ({ parent } = parent);
      }
    }

    if (parent) {
      parent.state.status = sym.active;
    }

    return parent;
  }
}
