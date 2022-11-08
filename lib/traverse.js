const emptyStack = require('@iter-tools/imm-stack');
const { get, isSymbol } = require('./utils/object.js');
const { indent, formatNodeType } = require('./utils/internal.js');
const { fragmentNodeFor } = require('./utils/fragment.js');
const { sourceFor } = require('./sources/index.js');
const { State } = require('./state.js');
const { Grammar } = require('./grammar.js');
const { PathFacade } = require('./path.js');
const { ContextFacade } = require('./context.js');
const { ResolverFacade } = require('./resolver.js');
const { matchDescriptor } = require('./descriptor.js');
const { debug, debugDesc, debugHoist, debugTree } = require('./debug.js');
// prettier-ignore
const {
  none,
  defer,
  _actual,
  Fragment,
  eatGrammar, matchGrammar, eatMatchGrammar,
  eat, match, eatMatch,
  reference,
  startNode, endNode,
  startNodeToken, endNodeToken,
} = require('./symbols.js');

const traverse = (node, grammar, options = {}) => {
  const context = ContextFacade.from(sourceFor(node, grammar, options), grammar, options);
  const { matchNodesByRef } = context[_actual];

  const path = PathFacade.from(fragmentNodeFor(node));
  const rootState = new State(path, context[_actual].source, Grammar.fromPath(path, context));

  if (debugTree.enabled) {
    debugTree(`  -> ${formatNodeType(path.node)}`);
  }

  const result = traverseFragment(context, rootState);

  if (!result) {
    throw new Error('cst-tokens failed parsing');
  }

  const outerTokens = [...result];

  if (outerTokens.find(isSymbol)) {
    throw new Error('cst-tokens: Fragment grammar should not use startNode or endNode');
  }

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
  const getState = () => s.facade;

  s.grammar.init(getState);

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
        case matchGrammar:
        case eatMatchGrammar:
        case eatGrammar: {
          const grammar = value;
          const { result } = s;

          if (debug.enabled) debug(indent(s, `          --> ${cmdName}`), grammar.name);

          s = s.branch(); // nested state
          s.grammar = new Grammar(grammar, context);
          s.result = emptyStack;
          s.depth++;

          if (type !== eatGrammar) {
            s.source = s.source.branch();
            s.resolver = s.resolver.branch();
          }

          const fragResult = traverseFragment(context, s);

          if (debug.enabled) {
            const reject = s.status === 'rejected' && type === eatGrammar;
            const arrow = `      ${reject ? 'x--' : '<--'}`;
            debug(indent(s, arrow));
          }

          if (fragResult && type !== matchGrammar) {
            s = s.accept();
            s.result = result.concat(fragResult);
          } else if (!fragResult && type === eatGrammar) {
            s.grammar.return(null);
            s.status = 'rejected';
          } else {
            s = s.parent;
            s.status = 'active';
          }

          returnValue = fragResult;
          break;
        }

        case match:
        case eatMatch:
        case eat: {
          const descriptor = value;
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
              s.result = s.result.push(token);
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
          s.resolver = ResolverFacade.from(child);
          s.result = emptyStack;
          s.grammar = Grammar.fromPath(s.path, context).init(getState);

          if (debugTree.enabled) debugTree(indent(s, `  -> ${formatNodeType(child)}`));

          returnValue = defer;
          break;
        }

        case startNode: {
          if (!s.isHoisting) {
            throw new Error('Cannot startNode: invalid state');
          }

          s.hoistingPathDepth++;

          const token = { type: startNodeToken, value: s.hoistingPathDepth };

          s.result = s.result.push(token);

          if (debugHoist.enabled) {
            const { node } = s.hoistingPath;
            const nodeName = s.isHoisting ? ` ${formatNodeType(node)}` : '';
            debugHoist(indent(s, `    ${cmdName} ${s.hoistingPathDepth}${nodeName}`));
          }

          returnValue = token;
          break;
        }

        case endNode: {
          if (s.isHoisting) {
            throw new Error('Cannot endNode: invalid state');
          }

          if (debugHoist.enabled) {
            const { node } = s.hoistingPath;
            const nodeName = s.isHoisting ? ` ${formatNodeType(node)}` : '';
            debugHoist(indent(s, `    ${cmdName} ${s.hoistingPathDepth}${nodeName}`));
          }

          const token = { type: endNodeToken, value: s.hoistingPathDepth };

          if (s.result.size) {
            s.result = s.result.push(token);
            s.hoistingPathDepth--;
          } else {
            s.status = 'rejected';
            s.grammar.return(null);
          }

          returnValue = token;
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

    if (!s.isRoot) {
      // a node traversal has finished
      const { path, node, result } = s;

      if (s.isActive) {
        const cstTokens = [];
        const matchNode = { node, cstTokens };
        const { refToken, depth: pathDepth } = path[_actual];

        s = s.accept();
        s.hoistingPathDepth--;

        if (result) {
          let inChild = false;
          for (const token of result) {
            const { type, value } = token;

            if (type === startNodeToken || type === endNodeToken) {
              if (value === pathDepth) {
                if (type !== startNodeToken) {
                  s.result = s.result.push(refToken);
                }
                inChild = type === startNodeToken;
                continue;
              } else if (value === pathDepth - 1) {
                s.hoistingPathDepth += type === startNodeToken ? 1 : -1;
              }
            }

            if (inChild) {
              cstTokens.push(token);
            } else {
              s.result = s.result.push(token);
            }
          }
        }

        matchNodesByRef.set(refToken, matchNode);

        if (debugTree.enabled) debugTree(indent(s, `  <- ${formatNodeType(s.node)}`));

        s.grammar.advance(refToken);
      } else {
        s = s.parent;

        s.status = 'rejected';
        if (s.parent.grammar !== s.grammar) {
          s.grammar.return(null);
        }

        if (debugTree.enabled) debugTree(indent(s, `  x- ${formatNodeType(s.node)}`));

        if (!s.parent?.path) {
          return null;
        }
      }
    } else {
      if (s.isActive) {
        if (debug.enabled && !s.depth) debug('       done');

        return s.result;
      } else {
        return null;
      }
    }
  }
};

module.exports = { traverse };
