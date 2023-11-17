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
    this.precedingTerminal = state.result;
    this.finalTerminal = null;

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
    return !!this.precedingTerminal && !!this.finalTerminal;
  }

  get empty() {
    return this.captured && this.precedingTerminal === this.finalTerminal;
  }

  exec(state, effects, matcher, props) {
    const { ctx } = this;
    const { grammar } = ctx;
    const isTerminal = matcher.type === 'TerminalMatcher';
    const monoType = isTerminal ? matcher.properties.type : matcher.properties.type;
    const type = getCooked(monoType);

    const [, props_ = props] = isTerminal ? transformTerminalMatcher(matcher) : [matcher];

    const args = reifyArgs(reifyExpression(props_), state, ctx);

    const co = new Coroutine(
      // type may be Language:Type
      getProduction(grammar, type).apply(grammar, args),
    );

    return this.push(new Match(ctx, state, matcher, effects, co));
  }

  capture() {
    const { precedingTerminal, context, state } = this;
    const { prevTerminals, nextTerminals, tagPairs } = context;
    const finalTerminal = state.result;

    this.finalTerminal = finalTerminal;

    if (precedingTerminal === finalTerminal) {
      return null;
    } else {
      let term = prevTerminals.get(finalTerminal);
      let nextTerm = finalTerminal;

      for (;;) {
        if (tagPairs.has(term)) {
          if (term.type !== 'CloseTag') {
            nextTerminals.set(term, nextTerm);
          }

          term = tagPairs.get(term);
          nextTerm = term;

          if (term.type === 'OpenTag') {
            prevTerminals.delete(term);
          }

          term = prevTerminals.get(term);
        }

        if (term === precedingTerminal) break;

        nextTerminals.set(term, nextTerm);
        nextTerm = term;
        term = prevTerminals.get(term);
      }

      // The next token after the preceding token will be the initial token
      const initialTag = nextTerm;

      tagPairs.set(initialTag, finalTerminal);
      tagPairs.set(finalTerminal, initialTag);

      return [initialTag, finalTerminal];
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
