import emptyStack from '@iter-tools/imm-stack';
import { get, freezeSeal } from './utils/object.js';
import { indent, formatType, formatIndex } from './utils/format.js';
import { fragmentNodeFor } from './utils/fragment.js';
import { TextSource } from './sources/text.js';
import { TokensSource } from './sources/tokens.js';
import { State } from './state.js';
import { Production } from './production.js';
import { Path } from './path.js';
import { Resolver } from './resolver.js';
import { matchDescriptor } from './descriptor.js';
import { debug, debugDesc, debugHoist, debugTree } from './debug.js';
import { facades } from './facades.js';
import { buildCSTNode } from './cst.js';
// prettier-ignore
import {
  none,
  defer,
  EOF,
  eatProduction, matchProduction, eatMatchProduction,
  eat, match, eatMatch,
  reference,
  startNode, endNode,
  startNodeToken, endNodeToken,
  leadingHoist, trailingHoist,
  active, rejected, _actual,
} from './symbols.js';

const traverseFragment = (node, grammar, options = {}) => {
  const { sourceText: text } = options;
  const source = text != null ? new TextSource(text) : new TokensSource(node);

  const fragment = fragmentNodeFor(node, source);
  const path = new Path(fragment);
  const production = Production.fromPath(path, grammar);
  const rootState = new State(path, source, production);

  if (debugTree.enabled) debugTree('  -> CSTFragment');

  const result = traverse(grammar, rootState);

  if (debug.enabled) debugTree(`  <- CSTFragment`);

  if (!result) throw new Error('cst-tokens failed parsing');

  if (rootState.source.type === 'TextSource' && !rootState.source.done) {
    throw new Error(`Parsing failed: source not completely consumed`);
  }

  return buildCSTNode(null, fragment, [...result], grammar);
};

// Executes token matching. Advances grammar generators.
// Takes tokens from `state.source` and emits them into `state.result`
const traverse = (grammar, rootState) => {
  let debug_ = false;
  let s = rootState;
  const getState = () => facades.get(s);

  s.production.init(getState);

  for (;;) {
    while (!s.production.done) {
      // The production generator has just yielded a command
      const { value: command } = s.production;
      const { type, value, error: cause } = command;
      const cmdName = type.description.replace('@cst-tokens/command/', '');
      let returnValue = none;

      if (debug_) {
        debug_ = false;
        debugger;
      }

      switch (type) {
        case matchProduction:
        case eatMatchProduction:
        case eatProduction: {
          const production = value;
          const { result } = s;

          if (debug.enabled) debug(indent(s, `          --> ${cmdName}`), production.name);

          s = s.branch(); // nested state
          s.production = new Production(production);
          s.result = emptyStack;
          s.depth++;

          if (type !== eatProduction) {
            s.source = s.source.branch();
            s.resolver = s.resolver.branch();
          }

          const fragResult = traverse(grammar, s);

          if (debug.enabled) {
            const reject = s.status === rejected && type === eatProduction;
            const arrow = `      ${reject ? 'x--' : '<--'}`;
            debug(indent(s, arrow));
          }

          if (fragResult && type !== matchProduction) {
            s = s.accept();
            s.result = result.concat(fragResult);
          } else if (!fragResult && type === eatProduction) {
            s.production.return(null);
            s.status = rejected;
          } else {
            s = s.parent;
            s.status = active;
          }

          returnValue = fragResult?.size ? [...fragResult] : null;
          break;
        }

        case match:
        case eatMatch:
        case eat: {
          const descriptor = value;
          let result;

          if (descriptor === EOF) {
            returnValue = s.source.done ? { type: EOF, value: undefined } : null;
            break;
          }

          if (!s.source) {
            throw new Error('not implemented');
          } else if (
            s.source.type === 'TokensSource' &&
            (s.source.done || s.source.token.type !== descriptor.type)
          ) {
            result = null;
          } else {
            [s, result] = matchDescriptor(command, grammar, s);
          }

          if (debugDesc.enabled) {
            const prefix =
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

            token = freezeSeal({ type: descriptor.type, value: result });

            if (type !== match) {
              s.result = s.result.push(token);
            }
          } else {
            if (type === eat) {
              s.status = rejected;
              s.production.return(null);
            }
          }

          returnValue = token;

          break;
        }

        case reference: {
          const name = value;

          const refToken = { type: 'Reference', value: name };
          const resolvedPath = s.resolver.consume(name);
          const child = get(s.node, resolvedPath);

          // We don't need to match the ref token itself!
          // The source does that by omitting tokens that don't belong to the current node.

          if (!child) {
            throw new Error(`failed to resolve ref\`${name}\``);
          }

          if (child.type === 'CSTFragment') {
            throw new Error('fragment nodes are only permitted as the root of a tree');
          }

          s = s.branch();
          s.path = new Path(child, refToken, s.path);
          s.source = s.source.branch(child);
          s.resolver = new Resolver(child);
          s.result = emptyStack;
          s.hoist = leadingHoist;
          s.production = Production.fromPath(s.path, grammar).init(getState);

          if (debugTree.enabled) debugTree(indent(s, `  -> ${formatType(child.type)}`));

          returnValue = defer;
          break;
        }

        case startNode: {
          if (s.hoist !== leadingHoist) {
            throw new Error('Cannot startNode: invalid state');
          }

          s.hoistPathDepth++;
          s.hoist = s.hoistPathDepth < s.path.depth ? leadingHoist : null;

          const token = { type: startNodeToken, value: s.hoistPathDepth };

          s.result = s.result.push(token);

          if (debugHoist.enabled) {
            debugHoist(indent(s, `    ${cmdName}${formatIndex(s)}`));
          }

          returnValue = token;
          break;
        }

        case endNode: {
          if (s.hoist) {
            throw new Error('Cannot endNode: invalid state');
          }

          if (debugHoist.enabled) {
            debugHoist(indent(s, `    ${cmdName}${formatIndex(s)}`));
          }

          const token = { type: endNodeToken, value: s.hoistPathDepth };

          if (s.result.size) {
            s.result = s.result.push(token);
            s.hoist = trailingHoist;
            s.hoistPathDepth--;
          } else {
            s.status = rejected;
            s.production.return(null);
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
          throw new Error(`Unexpected command of {type: ${type?.toString()}}`, cause && { cause });
      }

      if (returnValue === none) {
        throw new Error('cst-tokens: unanticipated case: returnValue is none');
      } else if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!s.production.done) {
        s.production.advance(returnValue);
      }
    }

    if (!s.isRoot) {
      // a node traversal has finished
      const { path, node, result } = s;

      if (s.isActive) {
        if (result.size) {
          if (s.hoist === leadingHoist) {
            throw new Error('cst-tokens: grammar failed to startNode');
          } else if (!s.hoist) {
            throw new Error('cst-tokens: grammar failed to endNode');
          }
        }

        const cstTokens = [];
        const { refToken, depth: pathDepth } = path;

        if (debugTree.enabled) debugTree(indent(s, `  <- ${formatType(s.node.type)}`));

        s = s.accept();

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
                s.hoist = type === startNodeToken ? null : trailingHoist;
              }
            }

            if (inChild) {
              cstTokens.push(token);
            } else {
              s.result = s.result.push(token);
            }
          }
        }

        // In a production the CST node will be available as grammar.nodeForRef(refToken)
        buildCSTNode(refToken, node, cstTokens, grammar);

        s.production.advance(refToken);
      } else {
        if (!s.parent) {
          return null;
        }

        s = s.parent;

        s.status = rejected;
        if (!s.parent || s.parent.grammar !== s.production) {
          s.production.return(null);
        }

        if (debugTree.enabled) debugTree(indent(s, `  x- ${formatType(s.node.type)}`));

        if (!s.parent?.path) {
          return null;
        }
      }
    } else {
      if (s.isActive) {
        return s.result;
      } else {
        return null;
      }
    }
  }
};

export { traverseFragment as traverse };
