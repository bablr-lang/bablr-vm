const { facades } = require('./facades.js');
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
    const { production } = this;
    const grammar = facades.get(this.grammar);
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

module.exports = { Coroutine, Production };
