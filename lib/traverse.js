const debug = require('debug')('cst-tokens');
const { get } = require('./utils/object.js');
const { formatCommand } = require('./utils/command.js');
const { indent } = require('./utils/internal.js');
const { PathFacade } = require('./path.js');
const { State } = require('./state.js');
const { Coroutine } = require('./coroutine.js');
const { _actual } = require('./symbols.js');
const { ContextFacade } = require('./context.js');
const { matchDescriptor } = require('./descriptor');
const { sourceFor } = require('./sources/index.js');

debug.color = 77; // green

const generatorFor = (state, context) => {
  const { path } = state;
  const { node } = path;
  const { generators } = context[_actual];
  const visitor = generators[node.type];

  if (!visitor) {
    throw new Error(`Unknown node of {type: ${node.type}}`);
  }

  return visitor(path, context, state);
};

const fragmentFor = (node) => {
  return {
    type: 'Fragment',
    fragment: node,
    cstTokens: [{ type: 'Reference', value: 'fragment' }],
  };
};

const traverse = (node, grammar, options = {}) => {
  return traverse_(node, ContextFacade.from(sourceFor(node, grammar, options), grammar, options));
};

// Executes token matching. Serves as a coroutine to grammar generators.
// Takes tokens from `state.source` and emits them into `state.result`
// `node` is an AST node that acts as the "pattern" to match
const traverse_ = (node, context) => {
  const { fragment } = context[_actual];
  const { matchNodesByRef, isHoistable } = context[_actual];
  let path = PathFacade.from(fragment ? fragmentFor(node) : node);
  let state = new State(path, context[_actual].source);
  let co = (path.co = new Coroutine(
    fragment !== undefined ? fragment(path, context, state) : generatorFor(state, context),
  ));

  let debug_ = false;
  const initialState = state;

  if (debug.enabled) debug(' ->', path.node.type);

  for (;;) {
    while (!co.done) {
      // The grammar coroutine has just yielded a command
      const command = co.value;
      const { type, value, error: cause } = command;
      let returnValue = undefined;

      if (debug_) {
        debug_ = false;
        debugger;
      }

      switch (type) {
        case 'debug': {
          debug_ = true;
          break;
        }

        case 'branch': {
          if (value != null) {
            throw new Error('unknown branch value');
          }
          state = state.branch();
          returnValue = state.facade;
          break;
        }

        case 'accept': {
          if (value !== state.facade) {
            throw new Error('The state to be accepted is not on top', cause && { cause });
          }

          state = state.accept();
          returnValue = state.facade;
          break;
        }

        case 'reject': {
          const failedCommand = value;
          const nextState = state.reject();

          if (nextState) {
            state = nextState;
          } else {
            const cause = failedCommand?.error;

            throw new Error(
              `cst-tokens failed${
                failedCommand ? ` executing {command: ${formatCommand(failedCommand)}}` : ''
              }`,
              cause && { cause },
            );
          }

          returnValue = state.facade;
          break;
        }

        case 'match':
        case 'take': {
          const descriptor = value;

          debug(indent(state, type), descriptor.type);

          if (descriptor.type === 'Reference') {
            if (descriptor.mergeable || isHoistable(descriptor)) {
              throw new Error('Invalid reference descriptor');
            }
            const name = descriptor.value;
            const refToken = descriptor.build();
            const resolvedPath = state.resolver[_actual].consume(name);
            const child = get(path.node, resolvedPath);

            // We don't need to match the ref token itself!

            if (!child) {
              throw new Error(`failed to resolve ref\`${name}\``);
            }

            path = PathFacade.from(child, refToken, path, state);
            state = new State(path, state.source.branch(child), state.resolver.branch(child));
            co = path.co = new Coroutine(generatorFor(state, context));

            if (debug.enabled) debug(' ->', child.type);
          } else {
            if (type === 'match') {
              state = state.branch();
            }

            // descriptor.type !== Reference
            const baseState = state;
            let result;

            if (!state.source) {
              result = descriptor.build();
            } else if (
              state.source.type === 'TokensSource' &&
              (state.source.done || state.source.token.type !== descriptor.type)
            ) {
              result = null;
            } else {
              result = matchDescriptor(command, state);
            }

            if (!result) {
              const lastState = state;
              // This is sometimes rejecting into the parent node!!!
              // (when state.parent is undefined)
              state = state.reject();

              if (!state) {
                const cause = command.error;
                const cmd = formatCommand(command);
                const src = String(lastState.source);
                throw new Error(
                  `cst-tokens failed executing {command: ${cmd}} from {source: ${src}}`,
                  cause && { cause },
                );
              }
            }

            if (type === 'match' && result) {
              state = state.accept();
            }

            returnValue = result && [descriptor.build(result)];
          }

          break;
        }

        case 'emit': {
          const tokens = value;
          debug(indent(state, 'emit'), ...tokens.map((t) => t.type));
          for (const token of tokens) {
            if (!token.type || !token.value) {
              throw new Error('emitted token must have a type and value');
            }
          }

          state.result = state.result.concat(tokens);

          break;
        }

        default:
          throw new Error(`Unexpected command of {type: ${type}}`, cause && { cause });
      }

      // Don't advance past ref tokens until the child is processed
      if (!(type === 'take' && value.type === 'Reference')) {
        // Run the grammar generator until the next yield
        co.advance(returnValue);
      }
    }

    state.result = co.value != null ? co.value : state.result;

    path[_actual].matchNode = {
      node: path.node,
      source: state.source,
      cstTokens: [...state.result],
    };

    if (path.parent) {
      const { refToken, matchNode } = path[_actual];
      const { cstTokens } = matchNode;

      matchNodesByRef.set(refToken, matchNode);

      state = state.accept();
      path = path.parent;
      co = path.co;

      if (debug.enabled) debug(' <-', path.node.type);

      // find leading and trailing hoistables from matchNode.cstTokens and move them around refToken
      let leadingHoistEnd = 0,
        trailingHoistStart = cstTokens.length;

      for (let i = 0; i < cstTokens.length; i++) {
        if (isHoistable(cstTokens[i])) {
          leadingHoistEnd = i + 1;
        } else {
          break;
        }
      }

      for (let i = cstTokens.length - 1; i > leadingHoistEnd; i--) {
        if (isHoistable(cstTokens[i])) {
          trailingHoistStart = i - 1;
        } else {
          break;
        }
      }

      matchNode.cstTokens = cstTokens.slice(leadingHoistEnd, trailingHoistStart);

      co.advance([
        ...cstTokens.slice(0, leadingHoistEnd),
        refToken,
        ...cstTokens.slice(trailingHoistStart, cstTokens.length),
      ]);
    } else {
      debug('    done');
      // We have finished processing all nodes!
      break;
    }
  }

  let finalReturnValue;
  if (fragment) {
    const outerTokens = path[_actual].matchNode.cstTokens;
    const fragmentRefIdx = outerTokens.findIndex(
      (t) => t.type === 'Reference' && t.value === 'fragment',
    );

    if (fragmentRefIdx < 0) {
      throw new Error('fragment grammar must eat ref`fragment`');
    }

    const innerMatchNode = matchNodesByRef.get(outerTokens[fragmentRefIdx]);
    const innerTokens = innerMatchNode.cstTokens;

    innerMatchNode.cstTokens = outerTokens;
    outerTokens.splice(fragmentRefIdx, 1, ...innerTokens);

    finalReturnValue = [innerMatchNode, matchNodesByRef];
  } else {
    finalReturnValue = [path[_actual].matchNode, matchNodesByRef];
  }

  if (state !== initialState) {
    throw new Error('State stack not completely unwound');
  }

  if (state.source.type === 'TextSource' && !state.source.done) {
    throw new Error(`Parsing failed: source not completely consumed`);
  }

  return finalReturnValue;
};

module.exports = { traverse };
