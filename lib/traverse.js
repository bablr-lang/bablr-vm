const regexEscape = require('escape-string-regexp');
const { Pattern, exec } = require('@iter-tools/regex');
const { Resolver } = require('./resolver.js');
const { sourceFor } = require('./sources/index.js');
const { Path } = require('./path.js');
const { State } = require('./state.js');
const { Coroutine } = require('./coroutine.js');
const { Context } = require('./context.js');
const { get } = require('./utils/object.js');
const { match } = require('./commands.js');
const debug = require('debug')('cst-tokens');

// Executes token matching. Serves as a coroutine to grammar generators.
// Takes tokens from `source` and puts them in `matchNode.cstTokens`
// `node` is an AST node that acts as the "pattern" to match
const traverse = (node, grammar, options) => {
  const context = new Context(grammar, options);
  const { matchNodes } = context;
  let path = new Path(node, context);
  let state = new State(path, sourceFor(node, context));
  let co = (path.co = new Coroutine(state));

  path.matchNode.sourceType = state.source.sourceType;

  if (debug.enabled) debug('->', state.toString());

  for (;;) {
    while (!co.done) {
      // The grammar coroutine has just yielded a command
      const command = co.value;
      const { type, value, error: cause } = command;
      let returnValue = undefined;

      switch (type) {
        case 'debug': {
          // Continue evaluating until you are back at the top of the switch statement
          debugger;
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
            throw new Error('The state to be accepted is not on top');
          }

          state = state.parent.accept(state);
          returnValue = state.facade;
          break;
        }

        case 'reject': {
          const failedCommand = value;
          state = state.parent;

          if (!state) {
            // We failed!
            try {
              path = new Path(path.node, context, path.refToken, path.parent);
              state = new State(path, state.source.fallback());
              co = path.co = new Coroutine(state);
            } catch (e) {
              throw new Error(`Parsing failed`, {
                cause: failedCommand.error,
              });
            }
          }

          returnValue = state.facade;
          break;
        }

        case 'emit': {
          const token =
            typeof value === 'symbol' ? { type: 'Reference', value: value.description } : value;

          if (!token.type || !token.value) {
            throw new Error('emitted token must have a type and value');
          }

          path.matchNode.cstTokens.push(token);
          break;
        }

        case 'match': {
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
            co = path.co = new Coroutine(state);

            if (debug.enabled) debug('->', state.toString());
          } else {
            // descriptor.type !== Reference
            const descCo = descriptor.matchChrs();
            const descSource = state.source.branchDescriptor(descriptor);
            let descStep = descCo.next();

            while (!descStep.done) {
              const command = descStep.value;
              const { type, value } = command;
              let descReturnValue = undefined;

              switch (type) {
                case 'exec': {
                  let pattern = value;

                  if (typeof pattern === 'string') {
                    pattern = new RegExp(regexEscape(pattern), 'y');
                  }

                  if (!(pattern instanceof RegExp)) {
                    throw new Error('Unsupported pattern');
                  }

                  const flags = pattern.flags.includes('y') ? pattern.flags : pattern.flags + 'y';
                  const result =
                    exec(new Pattern(pattern.source, flags), descSource.chrs())[0] || null;

                  if (result) {
                    descSource.advanceChrs(result.length);
                  }

                  descReturnValue = result;

                  break;
                }
                default:
                  throw new Error(
                    `Unexpected command of {type: ${type}} emitted from descriptor.matchChrs`,
                  );
              }
              descStep = descCo.next(descReturnValue);
            }

            const result = descStep.value;

            if (result === '') {
              throw new Error('Descriptors must not be optional', cause && { cause });
            }

            if (result) {
              returnValue = [descriptor.build(descStep.value)];

              state.source.accept(descSource);
            }
          }

          break;
        }

        default:
          throw new Error(`Unexpected command of {type: ${type}}`, cause && { cause });
      }

      // Don't advance past ref tokens until the child is processed
      if (!(type === 'match' && value.type === 'Reference')) {
        // Run the grammar generator until the next yield
        co.advance(returnValue);
      }
    }

    if (state.source.type === 'TokensSource' && !state.source.done) {
      path = new Path(path.node, context, path.refToken, path.parent);
      state = new State(path, state.source.fallback());
      co = path.co = new Coroutine(state);
    }

    if (debug.enabled) debug('<-', state.toString());

    if (path.parent) {
      const { refToken, matchNode } = path;
      const { cstTokens } = matchNode;
      matchNodes.set(refToken, matchNode);

      state = path.parentState.accept(state);
      path = path.parent;
      co = path.co;

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
      // We have finished processing all nodes!
      break;
    }
  }

  if (state.source.type === 'TextSource' && !state.source.done) {
    throw new Error(`Parsing failed: source not completely consumed`);
  }

  return [path.matchNode, matchNodes];
};

module.exports = { traverse };
