class Coroutine {
  constructor(state) {
    const { path } = state;
    const { node, context } = path;
    const { generators } = context;
    const visitor = generators[node.type];

    if (!visitor) {
      throw new Error(`Unknown node of {type: ${node.type}}`);
    }

    this.generator = visitor(path.facade, context.facade, state.facade);
    this.current = this.generator.next();
  }

  get value() {
    return this.current.value;
  }

  get done() {
    return this.current.done;
  }

  advance(value) {
    if (!this.current.done) {
      this.current = this.generator.next(value);
    }
    return this;
  }
}

module.exports = { Coroutine };
