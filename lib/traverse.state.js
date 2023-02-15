import emptyStack from '@iter-tools/imm-stack';

import { freezeSeal } from './utils/object.js';
import { facades } from './utils/facades.js';
import { Resolver } from './resolver.js';
import { TokenizerState } from './tokenize.state.js';
import { _actual, active, suspended, accepted, rejected } from './symbols.js';

export class StateFacade {
  constructor(state) {
    this[_actual] = state;

    freezeSeal(this);
  }

  get status() {
    return this[_actual].status;
  }

  get path() {
    return facades.get(this[_actual].path);
  }

  toString() {
    return this.tokenizer.toString();
  }
}

export class State {
  constructor(
    path,
    tokenizer, // TokenizerState
    result = null, // Token
    resolvers = emptyStack.push(Resolver.from(path.node)),
    coroutines = emptyStack,
    parent = null,
  ) {
    this.path = path;
    this.tokenizer = tokenizer;
    this.result = result;
    this.resolvers = resolvers;
    this.coroutines = coroutines;
    this.parent = parent;

    this.status = active;

    const facade = new StateFacade(this);

    facades.set(this, facade);
  }

  static from(path, source) {
    return new State(path, new TokenizerState(source));
  }

  get co() {
    return this.coroutines.value;
  }

  get resolver() {
    return this.resolvers.value;
  }

  get node() {
    return this.path.node;
  }

  get isActive() {
    return this.status === active;
  }

  ownTokensFor(path, prevTokensByToken, pathRangesByToken) {
    const [startNodeToken, endNodeToken] = path.outerRange;
    const cstTokens = [];

    for (
      let token = prevTokensByToken.get(endNodeToken);
      token !== startNodeToken;
      token = prevTokensByToken.get(token)
    ) {
      if (token.type === 'EndNode') {
        const range = pathRangesByToken.get(token);
        token = range[0];
      } else {
        cstTokens.push(token);
      }
    }

    cstTokens.reverse();

    return cstTokens;
  }

  branch() {
    if (this.status !== active) {
      throw new Error('Cannot branch a state that is not active');
    }

    this.status = suspended;

    const { path, tokenizer, result, resolvers, coroutines } = this;
    const nextState = new State(path, tokenizer, result, resolvers, coroutines, this);

    return nextState;
  }

  accept() {
    if (this.status !== active) {
      throw new Error('Cannot accept a state that is not active');
    }

    this.status = accepted;

    const { parent } = this;

    parent.tokenizer.accept(this.tokenizer);

    parent.path = this.path;
    parent.result = this.result;
    parent.resolvers = this.resolvers;
    parent.status = active;

    return parent;
  }

  reject() {
    if (this.status !== active) {
      throw new Error('Cannot reject a state that is not active');
    }

    const { parent } = this;

    this.tokenizer.reject();

    this.status = rejected;

    parent.status = active;

    return parent;
  }

  toString() {
    const { tokenizer, path } = this;
    const sourceSummary = tokenizer.toString();

    return `${path.node.type}${sourceSummary && ` (at ${sourceSummary})`}`;
  }
}
