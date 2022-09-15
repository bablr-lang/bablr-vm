const regexEscape = require('escape-string-regexp');
const { Pattern, exec } = require('@iter-tools/regex');
const { Resolver } = require('./resolver.js');
const { sourceFor } = require('./sources/index.js');
const { Path } = require('./path.js');
const { State } = require('./state.js');
const { Coroutine } = require('./coroutine.js');
const { Context } = require('./context.js');
const { get } = require('./utils/object.js');
const { formatCommand } = require('./utils/command.js');
const { indent } = require('./utils/internal.js');
const debug = require('debug')('cst-tokens');

const debugCmd = debug.extend('cmd');

debug.color = 77; // green
debugCmd.color = 69; // blue

const generatorFor = (state) => {
  const { path } = state;
  const { node, context } = path;
  const { generators } = context;
  const visitor = generators[node.type];

  if (!visitor) {
    throw new Error(`Unknown node of {type: ${node.type}}`);
  }

  return visitor(path.facade, context.facade, state.facade);
};

// Executes token matching. Serves as a coroutine to grammar generators.
// Takes tokens from `state.source` and emits them into `state.result`
// `node` is an AST node that acts as the "pattern" to match
const traverse = (node, grammar, options) => {
  const { Fragment } = grammar;
  const context = new Context(grammar, options);
  const { matchNodesByRef } = context;
  let path = new Path(Fragment ? { type: 'Fragment', fragment: node } : node, context);
  let state = new State(path, sourceFor(node, context));
  let co = (path.co = new Coroutine(
    Fragment !== undefined
      ? Fragment(path.facade, context.facade, state.facade)
      : generatorFor(state),
  ));

  if (Fragment) {
  }
  let debug_ = false;
  const initialState = state;

  if (debug.enabled) debug(' ->', state.toString());

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
            debug('fallback');
            try {
              path = new Path(path.node, context, path.refToken, path.parent);
              state = new State(path, state.source.fallback());
              co = path.co = new Coroutine(generatorFor(state));
            } catch (e) {
              const cause = failedCommand?.error;

              throw new Error(
                `cst-tokens failed${
                  failedCommand ? ` executing {command: ${formatCommand(failedCommand)}}` : ''
                }`,
                cause && { cause },
              );
            }
          }

          returnValue = state.facade;
          break;
        }

        case 'take': {
          const descriptor = value;

          if (descriptor.type === 'Reference') {
            if (descriptor.mergeable) {
              throw new Error('Invalid reference descriptor');
            }
            const name = descriptor.value;
            const refToken = descriptor.build();

            if (state.source.type === 'TokensSource') {
              const token = state.source.value;
              if (token.type !== 'Reference' || token.value !== name) {
                returnValue = null;
              }
            }

            const resolvedPath = state.resolver.consume(name);
            const child = get(path.node, resolvedPath);

            if (!child) {
              throw new Error(`failed to resolve ref\`${name}\``);
            }

            path = new Path(child, context, refToken, path, state);
            state = new State(path, state.source.branch(child), new Resolver(child));
            co = path.co = new Coroutine(generatorFor(state));

            if (debug.enabled) debug(' ->', state.toString());
          } else {
            debugCmd(`${indent(state)}take`, descriptor.type);
            // descriptor.type !== Reference
            const baseState = state;
            const descCo = descriptor.takeChrs();
            let descStep = descCo.next();
            let debug_ = false;

            state.source.selectTokens(descriptor);

            while (!descStep.done) {
              const command = descStep.value;
              const { type, value } = command;
              let descReturnValue = undefined;

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
                  debug('branch (desc)');
                  if (value != null) {
                    throw new Error('unknown branch value');
                  }

                  state = state.branch();
                  descReturnValue = state.facade;
                  break;
                }

                case 'accept': {
                  debug('accept (desc)');
                  if (value !== state.facade) {
                    throw new Error('The state to be accepted is not on top');
                  }

                  state = state.accept();
                  descReturnValue = state.facade;
                  break;
                }

                case 'reject': {
                  debug('reject (desc)');
                  if (state === baseState || !state.parent) {
                    throw new Error('Descriptor rejected a state it did not create');
                  }

                  const nextState = state.reject();

                  if (nextState) {
                    state = nextState;
                    descReturnValue = state.facade;
                  }
                  break;
                }

                case 'takeChrs': {
                  let pattern = value;

                  if (typeof pattern === 'string') {
                    pattern = new RegExp(regexEscape(pattern), 'y');
                  }

                  if (!(pattern instanceof RegExp)) {
                    throw new Error('Unsupported pattern');
                  }

                  const flags = pattern.flags.includes('y') ? pattern.flags : pattern.flags + 'y';
                  const result =
                    exec(new Pattern(pattern.source, flags), state.source.chrs())[0] || null;

                  if (result) {
                    state.source.advanceChrs(result.length);
                  }

                  descReturnValue = result;

                  break;
                }
                default:
                  throw new Error(
                    `Unexpected command of {type: ${type}} emitted from descriptor.takeChrs`,
                  );
              }
              descStep = descCo.next(descReturnValue);
            }

            state.source.deselectTokens();

            const result = descStep.value;

            if (result === '') {
              throw new Error('Descriptors must not be optional', cause && { cause });
            }

            if (state !== baseState) {
              throw new Error('Descriptor state stack not completely unwound');
            }

            if (!result) {
              const lastState = state;
              // This is sometimes rejecting into the parent node!!!
              // (when state.parent is undefined)
              state = state.reject();

              if (!state) {
                debug('fallback');
                try {
                  path = new Path(path.node, context, path.refToken, path.parent);
                  state = new State(path, state.source.fallback());
                  co = path.co = new Coroutine(generatorFor(state));
                } catch (e) {
                  const cause = command.error;
                  const cmd = formatCommand(command);
                  const src = lastState.source.facade.toString();
                  throw new Error(
                    `cst-tokens failed executing {command: ${cmd}} from {source: ${src}}`,
                    cause && { cause },
                  );
                }
              }
            }

            returnValue = result && [descriptor.build(result)];
          }

          break;
        }

        case 'emit': {
          const tokens = value;
          debugCmd('emit', ...tokens.map((t) => t.type));
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

    if (state.source.type === 'TokensSource' && !state.source.done) {
      debug('fallback');
      path = new Path(path.node, context, path.refToken, path.parent);
      state = new State(path, state.source.fallback());
      co = path.co = new Coroutine(generatorFor(state));
    }

    state.result = co.value != null ? co.value : state.result;

    path.matchNode = { node: path.node, source: state.source.facade, cstTokens: [...state.result] };

    if (path.parent) {
      const { refToken, matchNode } = path;
      const { cstTokens } = matchNode;

      matchNodesByRef.set(refToken, path.matchNode);

      state = state.accept();
      path = path.parent;
      co = path.co;

      if (debug.enabled) debug(' <-', state.toString());

      // find leading and trailing hoistables from matchNode.cstTokens and move them around refToken
      let leadingHoistEnd = 0,
        trailingHoistStart = cstTokens.length;

      for (let i = 0; i < cstTokens.length; i++) {
        if (context.isHoistable(cstTokens[i])) {
          leadingHoistEnd = i + 1;
        } else {
          break;
        }
      }

      for (let i = cstTokens.length - 1; i > leadingHoistEnd; i--) {
        if (context.isHoistable(cstTokens[i])) {
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
      debug('done');
      // We have finished processing all nodes!
      break;
    }
  }

  if (state !== initialState) {
    throw new Error('State stack not completely unwound');
  }
  if (state.source.type === 'TextSource' && !state.source.done) {
    throw new Error(`Parsing failed: source not completely consumed`);
  }

  if (Fragment) {
    const outerTokens = path.matchNode.cstTokens;
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

    return [innerMatchNode, matchNodesByRef];
  } else {
    return [path.matchNode, matchNodesByRef];
  }
};

module.exports = { traverse };
