import { WeakStackFrame } from './utils/object.js';
import { reifyArgs, reifyExpression, shouldBranch, effectsFor } from './utils/instruction.js';
import { getProduction } from './utils/grammar.js';
import { getCooked } from './utils/token.js';
import * as sym from './symbols.js';
import { Coroutine } from './coroutine.js';
import { transformTerminalMatcher } from './transforms.generated.js';

export class Match extends WeakStackFrame {
  constructor(context, state, matcher, path, effects, co) {
    if (!context || !state || !matcher || !effects || !co) {
      throw new Error('Invalid arguments to Match constructor');
    }

    super();

    this.context = context;
    this.state = state;
    this.matcher = matcher;
    this.path = path;
    this.effects = effects;
    this.co = co;
    this.precedingTerminal = state.result;
    this.finalTerm = null;

    this.status = sym.suspended;
  }

  static from(context, state, matcher, props) {
    const { grammar } = context;

    const effects = { success: sym.eat, failure: sym.fail };
    const args = reifyArgs(reifyExpression(props), state, context);

    const co = new Coroutine(
      getProduction(grammar, getCooked(matcher.properties.type)).apply(grammar, args),
    );

    const match = new Match(context, state, matcher, null, effects, co);

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
    return !!this.precedingTerminal && !!this.finalTerm;
  }

  get empty() {
    return this.captured && this.precedingTerminal === this.finalTerm;
  }

  exec(state, effects, matcher, path, props) {
    const { ctx } = this;
    const { grammar } = ctx;
    const isTerminal = matcher.type === 'TerminalMatcher';
    const monoType = isTerminal ? matcher.properties.type : matcher.properties.type;
    const type = getCooked(monoType);

    const [, props_ = props] = isTerminal ? transformTerminalMatcher(matcher) : [matcher];

    const args = reifyArgs(props_, state, ctx);

    const co = new Coroutine(
      // type may be Language:Type
      getProduction(grammar, type).apply(grammar, args),
    );

    return this.push(new Match(ctx, state, matcher, path, effects, co));
  }

  capture() {
    const { precedingTerminal, context, state } = this;
    const { prevTerminals, nextTerminals, tagPairs } = context;
    const finalTerm = state.result;

    this.finalTerm = finalTerm;

    if (precedingTerminal === finalTerm) {
      return null;
    } else {
      let term = prevTerminals.get(finalTerm);
      let nextTerm = finalTerm;

      for (;;) {
        if (term === precedingTerminal) break;

        if (term.type === 'CloseNode' && tagPairs.has(term)) {
          term = tagPairs.get(term);
          nextTerm = term;

          // if (term.type === 'OpenNode') {
          //   prevTerminals.delete(term);
          // }

          term = prevTerminals.get(term);
        }

        nextTerminals.set(term, nextTerm);
        nextTerm = term;
        term = prevTerminals.get(term);
      }

      // The next token after the preceding token will be the initial token
      const initialTerm = nextTerm;

      nextTerminals.set(precedingTerminal, initialTerm);

      tagPairs.set(initialTerm, finalTerm);
      tagPairs.set(finalTerm, initialTerm);

      return [initialTerm, finalTerm];
    }
  }

  collect() {
    const { captured, empty, co, effects } = this;

    let { parent } = this;

    co.finalize();

    if (!parent) return null;

    if ((!captured || empty) && effects.failure === sym.fail) {
      while (parent && !shouldBranch(parent.effects)) {
        parent.co.finalize();
        ({ parent } = parent);
      }
    }

    return parent;
  }
}
