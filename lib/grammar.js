const { DefaultFragment } = require('./utils/fragment.js');
const { Coroutine } = require('./utils/iterable.js');

class Grammar {
  constructor(grammar, context) {
    this.grammar = grammar;
    this.context = context;
    this.co = null;
  }

  static fromPath(path, context) {
    const { type } = path.node;
    let visitor = context.generators[type];

    if (type === 'CSTFragment' && !visitor) {
      visitor = DefaultFragment;
    }

    if (!visitor) throw new Error(`Unknown node of {type: ${type}}`);

    return new Grammar(visitor, context);
  }

  init(getState) {
    const { grammar, context } = this;
    const { path } = getState();

    this.grammar = grammar;
    this.co = new Coroutine(grammar(path, context, getState));
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

module.exports = { Coroutine, Grammar };
