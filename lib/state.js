import emptyStack from '@iter-tools/imm-stack';

import { freezeSeal } from './utils/object.js';
import { facades } from './utils/facades.js';
import { Resolver } from './resolver.js';
import { _actual, active, suspended, accepted, rejected } from './symbols.js';
import * as sym from './symbols.js';

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
  get lexicalContext() {
    return this[_actual].lexicalContext;
  }
  get mode() {
    return this[_actual].mode;
  }
  get lexicalContext() {
    return this[_actual].lexicalContext;
  }

  toString() {
    return this.tokenizer.toString();
  }
}

export class State {
  constructor(
    context,
    path,
    source,
    result = null,
    matchState = null,
    resolvers = emptyStack.push(Resolver.from(path.node)),
    coroutines = emptyStack,
    lexicalContexts = emptyStack.push('Bare'),
    mode = sym.token,
    parent = null,
  ) {
    this.context = context;
    this.path = path;
    this.source = source; // Iterable<string | Token>
    this.result = result;
    this.matchState = matchState;
    this.resolvers = resolvers;
    this.coroutines = coroutines;
    this.lexicalContexts = lexicalContexts;
    this.mode = mode;
    this.parent = parent;

    this.status = active;

    const facade = new StateFacade(this);

    facades.set(this, facade);
  }

  get lexicalContext() {
    return this.lexicalContexts.value;
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

    const {
      context,
      path,
      source,
      result,
      matchState,
      resolvers,
      coroutines,
      lexicalContexts,
      mode,
    } = this;
    const nextState = new State(
      context,
      path,
      source,
      result,
      matchState,
      resolvers,
      coroutines,
      lexicalContexts,
      mode,
      this,
    );

    return nextState;
  }

  accept() {
    if (this.status !== active) {
      throw new Error('Cannot accept a state that is not active');
    }

    this.status = accepted;

    const { parent } = this;

    parent.path = this.path;
    parent.source = this.source;
    parent.result = this.result;
    parent.matchState = this.matchState;
    parent.resolvers = this.resolvers;
    parent.coroutines = this.coroutines;
    parent.lexicalContexts = this.lexicalContexts;
    parent.mode = this.mode;
    parent.status = active;

    return parent;
  }

  reject() {
    if (this.status !== active) {
      throw new Error('Cannot reject a state that is not active');
    }

    const { parent } = this;

    this.source.reject();
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
