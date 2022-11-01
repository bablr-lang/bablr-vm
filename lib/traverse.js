const emptyStack = require('@iter-tools/imm-stack');
const { get } = require('./utils/object.js');
const { indent, formatNodeType } = require('./utils/internal.js');
const { fragmentNodeFor } = require('./utils/fragment.js');
const { getHoistingParentState } = require('./utils/hoisting.js');
const { sourceFor } = require('./sources/index.js');
const { PathFacade } = require('./path.js');
const { State } = require('./state.js');
const { Grammar } = require('./grammar.js');
const { ContextFacade } = require('./context.js');
const { matchDescriptor } = require('./descriptor');
const { debug, debugDesc, debugHoist, debugTree } = require('./debug.js');
// prettier-ignore
const {
  none,
  defer,
  _actual,
  Fragment,
  eatFragment, matchFragment, eatMatchFragment,
  eat, match, eatMatch,
  reference,
  startNode, endNode,
  leadingHoist, trailingHoist,
} = require('./symbols.js');

const traverse = (node, grammar, options = {}) => {
  const context = ContextFacade.from(sourceFor(node, grammar, options), grammar, options);
  const { matchNodesByRef } = context[_actual];

  const path = PathFacade.from(fragmentNodeFor(node));
  const rootState = new State(path, context[_actual].source, Grammar.from(path, context));

  const outerMatchNode = traverseFragment(context, rootState);

  if (!outerMatchNode) {
    throw new Error('cst-tokens failed parsing');
  }

  const { cstTokens: outerTokens } = outerMatchNode;
  const fragmentRefIdx = outerTokens.findIndex((t) => t.type === 'Reference');

  if (fragmentRefIdx < 0) {
    throw new Error('fragment grammar must eat ref`fragment`');
  }
  const innerMatchNode = matchNodesByRef.get(outerTokens[fragmentRefIdx]);
  const innerTokens = innerMatchNode.cstTokens;

  outerTokens.splice(fragmentRefIdx, 1, ...innerTokens);
  innerMatchNode.cstTokens = outerTokens;

  if (rootState.source.type === 'TextSource' && !rootState.source.done) {
    throw new Error(`Parsing failed: source not completely consumed`);
  }

  return [innerMatchNode, matchNodesByRef];
};

// Executes token matching. Advances grammar generators.
// Takes tokens from `state.source` and emits them into `state.result`
const traverseFragment = (context, rootState) => {
  const { matchNodesByRef } = context[_actual];

  let debug_ = false;
  let s = rootState;
  const getState = () => s;

  s.grammar.init(getState);

  if (debugTree.enabled) {
    debugTree(indent(s, `  -> ${formatNodeType(s.node)}`));
  }

  for (;;) {
    while (!s.grammar.done) {
      // The grammar coroutine has just yielded a command
      const { value: command } = s.grammar;
      const { type, value, error: cause } = command;
      const cmdName = type.description.replace('@cst-tokens/commands/', '');
      let returnValue = none;

      if (debug_) {
        debug_ = false;
        debugger;
      }

      switch (type) {
        case matchFragment:
        case eatMatchFragment:
        case eatFragment: {
          const grammar = value;

          if (debug.enabled) debug(indent(s, `       -----> ${cmdName}`), grammar.name);

          const hps = getHoistingParentState(s);
          const ts = s.hoisting ? hps : s; // target state

          const nestedFragmentState = s.branch();
          nestedFragmentState.path = PathFacade.from(fragmentNodeFor(s.node), null);
          nestedFragmentState.result = emptyStack;

          const nestedRootState = new State(
            s.path,
            type === eatFragment ? s.source : s.source.branch(),
            new Grammar(grammar, context),
            s.depth + 1,
            s.hoisting,
            type === eatFragment ? s.resolver : s.resolver.branch(),
            emptyStack,
            nestedFragmentState,
          );

          // s.grammar starts over because the fragment ref recreates it!

          const matchNode = traverseFragment(context, nestedRootState);

          if (debug.enabled) {
            const reject = s.status === 'rejected' && type === eatFragment;
            const arrow = `       ${reject ? 'x-----' : '<-----'}`;
            debug(indent(s, arrow));
          }

          if (matchNode) {
            if (type !== matchFragment) {
              s.source = nestedRootState.source;
              s.resolver = nestedRootState.resolver;
              s.hoisting = nestedRootState.hoisting;

              for (const token of matchNode.cstTokens) {
                if (token.type === 'Reference') {
                  const { cstTokens: innerTokens } = matchNodesByRef.get(token);

                  if (type !== matchFragment) {
                    ts.result = ts.result.concat(innerTokens);
                  }
                } else {
                  if (type !== matchFragment) {
                    ts.result = ts.result.push(token);
                  }
                }
              }
            }
          } else if (type === eatFragment) {
            s.grammar.return(null);
            s.status = 'rejected';
          }

          returnValue = matchNode;
          break;
        }

        case match:
        case eatMatch:
        case eat: {
          const descriptor = value;

          // descriptor.type !== Reference

          let result;

          if (!s.source) {
            result = descriptor.build();
          } else if (
            s.source.type === 'TokensSource' &&
            (s.source.done || s.source.token.type !== descriptor.type)
          ) {
            result = null;
          } else {
            [s, result] = matchDescriptor(command.value, s, cause);
          }

          if (debugDesc.enabled) {
            let prefix =
              (type !== eat ? '? ' : '  ') +
              (result ? (type === match ? '[*]' : '[+]') : type === eat ? '[x]' : '[ ]');

            debugDesc(indent(s, `   ${prefix} ${descriptor.type}`));
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

            if (type !== match) {
              const hps = getHoistingParentState(s);
              const ts = s.hoisting && hps ? hps : s;

              ts.result = ts.result.push(token);
            }
          } else {
            if (type === eat) {
              if (s.depth > 0) {
                s.status = 'rejected';
                s.grammar.return(null);
              } else {
                const src = String(s.source);
                throw new Error(
                  `cst-tokens failed executing {command: ${cmdName}} from {source: ${src}}`,
                  cause && { cause },
                );
              }
            }
          }

          returnValue = token;

          break;
        }

        case reference: {
          const name = value;

          const refToken = { type: 'Reference', value: name };
          const resolvedPath = s.resolver[_actual].consume(name);
          const child = get(s.node, resolvedPath);

          // We don't need to match the ref token itself!
          // The source does that by omitting tokens that don't belong to the current node.

          if (!child) {
            throw new Error(`failed to resolve ref\`${name}\``);
          }

          if (child.type === Fragment) {
            throw new Error('fragment nodes are only permitted as the root of a tree');
          }

          s = s.branch();
          s.path = PathFacade.from(child, refToken, s.path);
          s.source = s.source.branch(child);
          s.resolver = s.resolver.branch(child);
          s.hoisting = leadingHoist;
          s.result = emptyStack;
          s.grammar = Grammar.from(s.path, context).init(getState);

          if (debugTree.enabled) debugTree(indent(s, `  -> ${formatNodeType(child)}`));

          returnValue = defer;
          break;
        }

        case startNode: {
          if (s.hoisting !== leadingHoist) {
            throw new Error('Cannot startNode: invalid state');
          }

          if (debugHoist.enabled) debugHoist(indent(s, `    ${cmdName}`));

          s.hoisting = null;
          s.result.push(startNode);

          returnValue = undefined;
          break;
        }

        case endNode: {
          if (s.hoisting) {
            throw new Error('Cannot endNode: invalid state');
          }

          if (debugHoist.enabled) debugHoist(indent(s, `    ${cmdName}`));

          if (!s.result.size) {
            s.status = 'rejected';
            s.grammar.return(null);
          } else {
            s.result.push(endNode);
            s.hoisting = trailingHoist;
          }

          returnValue = undefined;
          break;
        }

        case 'debug': {
          debug_ = true;

          returnValue = undefined;
          break;
        }

        default:
          throw new Error(`Unexpected command of {type: ${type}}`, cause && { cause });
      }

      if (returnValue === none) {
        throw new Error('cst-tokens: unanticipated case: returnValue is none');
      } else if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!s.grammar.done) {
        s.grammar.advance(returnValue);
      }
    }

    if (s.parent) {
      // a node traversal has finished

      if (s.active) {
        if (s.hoisting === leadingHoist) {
          throw new Error('cst-tokens: grammar failed to startNode');
        } else if (!s.hoisting) {
          throw new Error('cst-tokens: grammar failed to endNode');
        }

        const cstTokens = [...s.result];
        const matchNode = { node: s.node, cstTokens };
        const { refToken } = s.path[_actual];

        s = s.accept();
        matchNodesByRef.set(refToken, matchNode);

        if (debugTree.enabled) debugTree(indent(s, `  <- ${formatNodeType(s.node)}`));

        s.grammar.advance(refToken);
      } else {
        s = s.parent;

        s.status = 'rejected';
        if (s.parent?.path) {
          s.grammar.return(null);
        }

        if (debugTree.enabled) debugTree(indent(s, `  x- ${formatNodeType(s.node)}`));

        if (!s.parent?.path) {
          return null;
        }
      }
    } else {
      if (s.active) {
        const cstTokens = [...s.result];
        const matchNode = { node: s.node, cstTokens };

        if (debug.enabled && !s.depth) debug('       done');

        return matchNode;
      } else {
        return null;
      }
    }
  }
};

module.exports = { traverse };
