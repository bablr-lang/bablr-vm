import { WeakStackFrame } from './utils/object.js';
import { reifyArgs } from './utils/instruction.js';
import { getProduction } from './utils/grammar.js';
import { getCooked } from './utils/token.js';
import { Coroutine } from './coroutine.js';
import { buildTerminalProps } from './transforms.generated.js';

export class Match extends WeakStackFrame {
  constructor(context, state, matcher, effects, co) {
    if (!context || !state || (matcher && (!effects || !co))) {
      throw new Error('Invalid arguments to Match constructor');
    }

    super();

    this.context = context;
    this.state = state;
    this.matcher = matcher;
    this.effects = effects;
    this.co = co;

    this.path = state.path;
    this.range = [];
  }

  static from(context, state) {
    return new Match(context, state, null, null, null);
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
    return getCooked(this.matcher.properties.type);
  }

  get grammar() {
    return this.context.grammar;
  }

  get captured() {
    return !!this.range[1];
  }

  get empty() {
    const { range, ctx, path, parent } = this;

    if (['OpenNodeTag', 'OpenTerminalNodeTag'].includes(range[0]?.type) && path !== parent.path) {
      const nextTag = ctx.nextTerminals.get(range[0]);
      if (!nextTag || nextTag.type === 'CloseNodeTag') {
        return null;
      }
    } else {
      return range[0] === range[1];
    }
  }

  exec(state, effects, matcher, props) {
    if (typeof path === 'string') throw new Error();

    const { ctx } = this;
    const { grammar } = ctx;
    const isTerminal = matcher.type === 'TerminalMatcher';
    const monoType = isTerminal ? matcher.properties.type : matcher.properties.type;
    const type = getCooked(monoType);

    const props_ = isTerminal ? buildTerminalProps(matcher) : props;

    const args = reifyArgs(props_, state, ctx);

    const co = new Coroutine(
      // type may be Language:Type
      getProduction(grammar, type).apply(grammar, args),
    );

    const match = new Match(ctx, state, matcher, effects, co);

    match.range[0] = state.result;

    return this.push(match);
  }

  capture() {
    const { range, state } = this;

    if (!range[0]) return null;

    range[1] = state.result;

    return this.empty ? null : range;
  }

  collect() {
    let { captured, empty, co, parent, state } = this;

    co.finalize();

    if (!parent) return null;

    if (!captured || empty) {
      while (parent.co && parent.state === state) {
        parent.co.finalize();
        ({ parent } = parent);
      }
    }

    return parent;
  }
}
