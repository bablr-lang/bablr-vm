import { WeakStackFrame } from './utils/object.js';
import { reifyArgs, reifyExpression, shouldBranch, effectsFor } from './utils/instruction.js';
import { getProduction } from './utils/grammar.js';
import { getCooked } from './utils/token.js';
import * as sym from './symbols.js';
import { Coroutine } from './coroutine.js';
import { transformTerminalMatcher } from './transforms.generated.js';

export class Match extends WeakStackFrame {
  constructor(context, state, matcher, effects, co) {
    if (!context || !state || !matcher || !effects || !co) {
      throw new Error('Invalid arguments to Match constructor');
    }

    super();

    this.context = context;
    this.state = state;
    this.matcher = matcher;
    this.effects = effects;
    this.co = co;
    this.precedingTag = null;
    this.finalTag = null;

    this.status = sym.suspended;
  }

  static from(context, state, matcher, props) {
    const { grammar } = context;

    const effects = { success: sym.eat, failure: sym.none };
    const args = reifyArgs(reifyExpression(props), state, context);

    const co = new Coroutine(
      getProduction(grammar, getCooked(matcher.properties.type)).apply(grammar, args),
    );

    const match = new Match(context, state, matcher, effects, co);

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
    return this.matcher.type;
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

  exec(state, effects, matcher, props) {
    const { ctx } = this;
    const { grammar } = ctx;
    const isTerminal = matcher.type === 'TerminalMatcher';

    const [, props_ = props] = isTerminal ? transformTerminalMatcher(matcher) : [matcher];

    __print(props_);

    const args = reifyArgs(reifyExpression(props_), state, ctx);

    const co = new Coroutine(
      // type may be Language:Type
      getProduction(grammar, getCooked(matcher.properties.type)).apply(grammar, args),
    );

    return this.push(new Match(ctx, state, matcher, effects, co));
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

  collect() {
    const { empty, effects, co, status } = this;

    let { parent } = this;

    co.finalize();

    if (status !== sym.rejected) {
      if (empty || effects.success === sym.fail) {
        this.status = sym.rejected;
      }
    }

    if (!parent) return null;

    if (status === sym.rejected) {
      while (parent && !shouldBranch(effectsFor(parent))) {
        parent.co.finalize();
        ({ parent } = parent);
      }
    }

    if (parent) {
      parent.status = sym.active;
    }

    return parent;
  }
}
