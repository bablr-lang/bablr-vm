const { DefaultFragment } = require('./utils/fragment.js');
const { Coroutine } = require('./utils/iterable.js');

class Production {
  constructor(production, context) {
    this.production = production;
    this.context = context;
    this.co = null;
  }

  static fromPath(path, context) {
    const { type } = path.node;
    let visitor = context.productions[type];

    if (type === 'CSTFragment' && !visitor) {
      visitor = DefaultFragment;
    }

    if (!visitor) throw new Error(`Unknown node of {type: ${type}}`);

    return new Production(visitor, context);
  }

  init(getState) {
    const { production, context } = this;
    const { path } = getState();

    this.production = production;
    this.co = new Coroutine(production(path, context, getState));
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
