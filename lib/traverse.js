const debug = require('debug')('cst-tokens');
const emptyStack = require('@iter-tools/imm-stack');
const { get } = require('./utils/object.js');
const { formatCommand } = require('./utils/command.js');
const { indent } = require('./utils/internal.js');
const { isArray, nullOr } = require('./utils/array.js');
const { PathFacade } = require('./path.js');
const { State } = require('./state.js');
const { Grammar } = require('./grammar.js');
const { _actual, Fragment } = require('./symbols.js');
const { ContextFacade } = require('./context.js');
const { matchDescriptor } = require('./descriptor');
const { sourceFor } = require('./sources/index.js');

debug.color = 77; // green

const none = Symbol('none');
const defer = Symbol('defer');

const grammarFor = (path, context) => {
  const { type } = path.node;
  const visitor = context.generators[type];

  if (!visitor) {
    throw new Error(`Unknown node of {type: ${type}}`);
  }

  return new Grammar(visitor, context);
};

const traverseFragment = (node, grammar, options = {}) => {
  const context = ContextFacade.from(sourceFor(node, grammar, options), grammar, options);
  const { generators, matchNodesByRef } = context[_actual];
  const { [Fragment]: FragmentGenerator } = generators;
  const path = PathFacade.from(
    FragmentGenerator
      ? {
          type: Fragment,
          fragment: node,
          cstTokens: [{ type: 'Reference', value: 'fragment' }],
        }
      : node,
  );
  const state = new State(path, context[_actual].source, grammarFor(path, context));

  const matchNode = traverse(context, state);

  let finalReturnValue;
  if (FragmentGenerator) {
    const outerTokens = matchNode.cstTokens;
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
    finalReturnValue = [matchNode, matchNodesByRef];
  }

  if (state.source.type === 'TextSource' && !state.source.done) {
    throw new Error(`Parsing failed: source not completely consumed`);
  }

  return finalReturnValue;
};

// Executes token matching. Serves as a coroutine to grammar generators.
// Takes tokens from `state.source` and emits them into `state.result`
// `node` is an AST node that acts as the "pattern" to match
const traverse = (context, initialState) => {
  const { matchNodesByRef, isHoistable } = context[_actual];

  let debug_ = false;
  let s = initialState;
  const getState = () => s;

  s.grammar.init(getState);

  if (debug.enabled && initialState.path !== initialState.parent?.path) {
    debug(' ->', s.path.node.type);
  }

  for (;;) {
    while (!s.grammar.done) {
      // The grammar coroutine has just yielded a command
      const { value: command } = s.grammar;
      const { type, value, error: cause } = command;
      let returnValue = none;

      if (debug_) {
        debug_ = false;
        debugger;
      }

      switch (type) {
        case 'debug': {
          debug_ = true;

          returnValue = undefined;
          break;
        }

        case 'testGrammar':
        case 'eatMatchGrammar':
        case 'eatGrammar': {
          const grammar = value;

          debug(indent(s, type), grammar.name);

          const { result } = s;

          s = s.branch();
          s.grammar = new Grammar(grammar, context);
          s.result = emptyStack;

          if (type !== 'eatGrammar') {
            s.source = s.source.branch();
            s.resolver = s.resolver.branch();
          }

          s = traverse(context, s);

          const matchResult = s.result.size ? [...s.result] : null;

          if (matchResult && type !== 'testGrammar') {
            s = s.accept();
            s.result = result.concat(matchResult);
          } else {
            s = s.reject();
          }

          returnValue = matchResult;
          break;
        }

        case 'match':
        case 'eatMatch':
        case 'eat': {
          const descriptor = value;

          if (descriptor.type === 'Reference') {
            if (type !== 'eat') {
              throw new Error('references must be eaten not matched');
            }

            debug(indent(s, type), descriptor.type);

            if (descriptor.mergeable || isHoistable(descriptor)) {
              throw new Error('Invalid reference descriptor');
            }

            const name = descriptor.value;
            const refToken = descriptor.build();
            const resolvedPath = s.resolver[_actual].consume(name);
            const child = get(s.path.node, resolvedPath);

            s.result = s.result.push(refToken);

            // We don't need to match the ref token itself!
            // The source does that by omitting tokens that don't belong to the current node.

            if (!child) {
              throw new Error(`failed to resolve ref\`${name}\``);
            }

            if (debug.enabled) debug(' ->', child.type);

            s = s.branch();
            s.path = PathFacade.from(child, refToken, s.path);
            s.source = s.source.branch(child);
            s.resolver = s.resolver.branch(child);
            s.grammar = grammarFor(s.path, context).init(getState);
            s.result = emptyStack;

            returnValue = defer;
          } else {
            // descriptor.type !== Reference

            const initialState = s;
            let result;

            if (!s.source) {
              debug(indent(s, type), descriptor.type, type !== 'eat' ? '[+]' : '');
              result = descriptor.build();
            } else if (
              s.source.type === 'TokensSource' &&
              (s.source.done || s.source.token.type !== descriptor.type)
            ) {
              debug(indent(s, type), descriptor.type);
              result = null;
            } else {
              [s, result] = matchDescriptor(command.value, s);

              debug(indent(s, type), descriptor.type, type !== 'eat' && result ? '[+]' : '');

              if (result === '') {
                throw new Error('Descriptors must not be optional', cause && { cause });
              }
            }

            let token = null;

            if (result) {
              if (/\r|\n/.test(result)) {
                if (descriptor.type === 'LineBreak') {
                  if (!/^\r|\r\n|\n$/.test(result)) {
                    throw new Error('Invalid LineBreak token');
                  }
                } else {
                  throw new Error('Only LineBreak descriptors may contain "\\r" or "\\n"');
                }
              }

              token = descriptor.build(result);

              if (type !== 'match') {
                s.result = s.result.push(token);
              }
            } else {
              if (type === 'eat' && s.path !== s.parent?.path) {
                const cause = command.error;
                const cmd = formatCommand(command);
                const src = String(initialState.source);
                throw new Error(
                  `cst-tokens failed executing {command: ${cmd}} from {source: ${src}}`,
                  cause && { cause },
                );
              }
            }

            returnValue = token;
          }

          break;
        }

        default:
          throw new Error(`Unexpected command of {type: ${type}}`, cause && { cause });
      }

      if (returnValue === none) {
        throw new Error('cst-tokens: unanticipated case: returnValue is none');
      } else if (returnValue === defer) {
        // execution is suspeneded until further traversal completes
      } else {
        // Run the grammar generator until the next yield
        s.grammar.advance(returnValue);
      }
    }

    if (!s.parent || s.path.node !== s.parent.path.node) {
      // a node traversal has finished

      const { refToken } = s.path[_actual];
      const cstTokens = [...s.result];
      const matchNode = {
        node: s.path.node,
        source: s.source,
        cstTokens,
      };

      if (s.parent) {
        matchNodesByRef.set(refToken, matchNode);

        s = s.accept();

        if (debug.enabled && initialState.path !== initialState.parent?.path) {
          debug(' <-', s.path.node.type);
        }

        // find leading and trailing hoistables from matchNode.cstTokens and move them around refToken
        // TODO give this an API worthy of a function
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

        s.grammar.advance([
          ...cstTokens.slice(0, leadingHoistEnd),
          refToken,
          ...cstTokens.slice(trailingHoistStart, cstTokens.length),
        ]);
      } else {
        if (s !== initialState) {
          throw new Error('State stack not completely unwound');
        }

        debug(' <- Ø');

        return matchNode;
      }
    } else {
      // A *grammar command has finished
      return s;
    }
  }
};

module.exports = { traverse: traverseFragment };
