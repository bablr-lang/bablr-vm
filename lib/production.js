import { DefaultFragment } from './utils/fragment.js';
import { Coroutine } from './utils/iterable.js';

export { Coroutine };

export class Production {
  constructor(production) {
    this.production = production;
    this.co = null;
  }

  static fromPath(path, grammar) {
    const { type } = path.node;
    let production = grammar.get(type);

    if (type === 'CSTFragment' && !production) {
      production = DefaultFragment;
    }

    if (!production) throw new Error(`Unknown node of {type: ${type}}`);

    return new Production(production);
  }

  init(getState) {
    const { production } = this;
    const { path } = getState();
    const { node } = path;
    const props = { path, node, getState };

    this.production = production;
    this.co = new Coroutine(production(props));
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
