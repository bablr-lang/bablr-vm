import { get, isArray, isString, freezeSeal } from './utils/object.js';
import { indent, formatType, formatIndex } from './utils/format.js';
import { facades } from './utils/facades.js';
import { fragmentNodeFor } from './utils/fragment.js';
import { State } from './state.js';
import { Production } from './production.js';
import { Path } from './path.js';
import { Tokenizer } from './tokenizer.js';
import { Source } from './source.js';
import { Resolver } from './resolver.js';
import { matchDescriptor } from './descriptor.js';
import { debug, debugDesc, debugTree } from './debug.js';
import { printTokens } from './print.js';
// prettier-ignore
import {
  _actual,
  none,
  defer,
  EOF,
  Fragment,
  eatProduction, matchProduction, eatMatchProduction,
  eat, match, eatMatch,
  reference,
  active, rejected,
  startNode, endNode,
} from './symbols.js';

export const traverse = (language, node, source) => {
  const path = new Path(node);
  const source_ = new Source(source);
  const tokenizer = new Tokenizer(language, path, source_);
  const production = Production.fromPath(path, language);
  const rootState = new State(path, tokenizer, production);

  const result = __traverse(language, rootState);

  if (!source.done) {
    throw new Error('Traversal did not fully consume source.');
  }

  source.release();

  return result;
};

export const traverseFragment = (language, node, source) => {
  if (!source instanceof Source) {
    throw new Error('traverseFragment must be given an instance of Source');
  }

  const path = new Path(node);
  const tokenizer = new Tokenizer(language, path, source);
  const production = Production.fromPath(path, language);
  const rootState = new State(path, tokenizer, production);

  return __traverse(language, rootState);
};

export const __traverse = (language, rootState) => {
  const { syntax: grammar } = language.grammars;
  let debug_ = false;
  let s = rootState;
  const getState = () => facades.get(s);

  s.production.init(getState);

  for (;;) {
    while (!s.production.done) {
      // The production generator has just yielded a command
      const { value: command } = s.production;
      const { type, value, error: cause } = command;
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

          if (debug.enabled) debug(indent(s, `          --> ${formatType(type)}`), production.name);

          s = s.branch(); // nested state
          s.production = new Production(production);
          s.depth++;

          if (type !== eatProduction) {
            s.tokenizer = s.tokenizer.branch();
            s.resolver = s.resolver.branch();
          }

          const fragResult = __traverse(grammar, s);

          if (debug.enabled) {
            const reject = s.status === rejected && type === eatProduction;
            const arrow = `      ${reject ? 'x--' : '<--'}`;
            debug(indent(s, arrow));
          }

          if (fragResult && type !== matchProduction) {
            s = s.accept();
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
          let property = null;
          let type = value;
          let value = null;
          if (isArray(value)) {
            const arr = value;
            property = arr[0];
            type = arr[1];
            value = arr[2];
          }

          if (!type) {
            throw new Error('matchCommand must have a type');
          }

          if (property != null && !isString(property)) {
            throw new Error('matchCommand.property must be a string or nullish');
          }

          let result;

          if (type === EOF) {
            returnValue = s.tokenizer.done ? { type: EOF, value: undefined } : null;
            break;
          }

          if (!s.tokenizer) {
            throw new Error('not implemented');
          } /* else if (
            s.tokenizer.type === TokensSource &&
            (s.tokenizer.done || s.tokenizer.token.type !== type)
          ) {
            result = null;
          } */ else {
            result = matchDescriptor(type, language, s.tokenizer, value);
          }

          if (debugDesc.enabled) {
            const prefix =
              (type !== eat ? '? ' : '  ') +
              (result ? (type === match ? '[*]' : '[+]') : type === eat ? '[x]' : '[ ]');

            debugDesc(indent(s, `   ${prefix} ${type}`));
          }

          let token = null;

          if (result) {
            token = freezeSeal({ type, value: result });
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
          if (!isArray(value) || value.length !== 2) {
            throw new Error('referenceCommand.value must be [property, type]');
          }

          if (!isString(value[0])) {
            throw new Error('referenceCommand.value[0] was not a property name');
          }

          if (!grammar.has(value[1]) && !grammar.aliases.has(value[1])) {
            throw new Error('referenceCommand.value[1] was not a valid type');
          }

          if (s.capture !== null) {
            throw new Error('Cannot reference inside a capture');
          }

          const [property, type] = value;
          const refToken = freezeSeal({ type: 'Reference', value: property });

          const resolvedProperty = s.resolver.consume(property);

          const child = get(s.node, resolvedProperty);

          // We don't need to match the ref token itself!
          // The tokenizer does that by omitting tokens that don't belong to the current node.

          if (!child) {
            throw new Error(`failed to resolve ref\`${property}\``);
          }

          if (child.type === Fragment) {
            throw new Error('fragment nodes are only permitted as the root of a tree');
          }

          if (!grammar.is(type, child.type)) {
            throw new Error(
              `reference failed: expected a reference of {type: ${type}} but received {type: ${child.type}}`,
            );
          }

          s = s.branch();
          s.path = new Path(child, refToken, s.path);
          s.tokenizer = s.tokenizer.branch(child);
          s.resolver = new Resolver(child);
          s.production = Production.fromPath(s.path, language).init(getState);

          if (debugTree.enabled) debugTree(indent(s, `  -> ${formatType(child.type)}`));

          returnValue = defer;
          break;
        }

        case startNode: {
          assertNodeNotStarted();

          s.tokenizer.startNode(s.path);

          returnValue = undefined;
          break;
        }

        case endNode: {
          assertNodeStarted();
          assertNodeNotEnded();

          returnValue = s.tokenizer.endNode();
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

    const returnValue = s.production.value;

    if (!s.isRoot) {
      // a node traversal has finished
      let { path } = s;

      s.tokenizer.endNode(s.path);

      s.path = path = path.parent;

      if (s.isActive) {
        const { refToken } = path;

        if (debugTree.enabled) debugTree(indent(s, `  <- ${formatType(s.node.type)}`));

        s = s.accept();

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
