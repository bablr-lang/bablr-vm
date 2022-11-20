const { DefaultFragment } = require('./utils/fragment.js');
const { Coroutine } = require('./utils/iterable.js');

class Production {
  constructor(production, grammar) {
    this.production = production;
    this.grammar = grammar;
    this.co = null;
  }

  static fromPath(path, grammar) {
    const { type } = path.node;
    let production = grammar.productionFor(type);

    if (type === 'CSTFragment' && !production) {
      production = DefaultFragment;
    }

    if (!production) throw new Error(`Unknown node of {type: ${type}}`);

    return new Production(production, grammar);
  }

  init(getState) {
    const { production, grammar } = this;
    const { path } = getState();

    this.production = production;
    this.co = new Coroutine(production({ path, grammar, getState }));
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

module.exports = { Coroutine, Production };
