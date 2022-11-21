import { facades } from './facades.js';
import { DefaultFragment } from './utils/fragment.js';
import { Coroutine } from './utils/iterable.js';

export { Coroutine };

export class Production {
  constructor(production, grammar) {
    this.production = production;
    this.grammar = grammar;
    this.co = null;
  }

  static fromPath(path, grammar) {
    const { type } = path.node;
    let production = grammar.get(type);

    if (type === 'CSTFragment' && !production) {
      production = DefaultFragment;
    }

    if (!production) throw new Error(`Unknown node of {type: ${type}}`);

    return new Production(production, grammar);
  }

  init(getState) {
    const { production, grammar } = this;
    const { path } = getState();
    const { node } = path;
    const { context } = grammar;

    this.production = production;
    this.co = new Coroutine(production({ path, node, grammar, context, getState }));
    return this;
  }

  get value() {
    return this.co.value;
  }

  get done() {
    return this.co.done;
  }

  advance(value) {
    this.co.advance(value);
  }

  return(value) {
    this.co.return(value);
  }
}
