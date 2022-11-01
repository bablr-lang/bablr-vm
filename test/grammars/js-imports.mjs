import t from '@babel/types';
import { eat, eatMatch, startNode, endNode } from '@cst-tokens/helpers/commands';
import { Bag } from '@cst-tokens/helpers/generators';
import { LineBreak, StringStart, StringEnd } from '@cst-tokens/helpers/descriptors';
import { ref, PN, LPN, RPN, KW } from '@cst-tokens/helpers/shorthand';
import * as sym from '@cst-tokens/helpers/symbols';
import { Identifier, String, Whitespace } from './js-descriptors.mjs';
export { parseModule as parse } from 'meriyah';

// export function* _(path, context, getState) {
//   return getState().source ? yield* Bag([Whitespace(), LineBreak()]) : [Whitespace().build()];
// }
const _ = Whitespace();

const spaceDelimitedTypes = ['Identifier', 'Keyword'];
const noSpaceTypes = ['String'];

const lastDescriptors = new WeakMap();

const findLastDesc = (state) => {
  let s = state;
  let lastDesc = null;
  while (s && !(lastDesc = lastDescriptors.get(s))) {
    s = s.parent;
  }
  return lastDesc;
};

export const WithWhitespace = (visitor) => {
  function* WithWhitespace__(path, context, getState) {
    const grammar = visitor(path, context, getState);
    const rootState = getState();
    let current = grammar.next();
    let state;

    while (!current.done) {
      const cmd = current.value;
      const cause = cmd.error;
      let returnValue;

      cmd.error = cause && new Error(undefined, { cause });

      state = getState();

      switch (cmd.type) {
        case sym.eatFragment:
        case sym.matchFragment:
        case sym.eatMatchFragment: {
          // I'm not able to propagate my custom state through this statement!
          // I have no access to the child state form outside
          // I have no access to the parent state from inside
          returnValue = yield { ...cmd, value: WithWhitespace(cmd.value) };
          break;
        }

        case sym.eat:
        case sym.match:
        case sym.eatMatch: {
          const desc = cmd.value;
          const lastDesc = findLastDesc(state);

          if (cmd.type !== sym.match) {
            lastDescriptors.set(state, desc);
          }

          const spaceIsAllowed =
            !lastDesc ||
            (!noSpaceTypes.includes(desc.type) && !noSpaceTypes.includes(lastDesc.type));

          if (spaceIsAllowed) {
            const spaceIsNecessary =
              !!lastDesc &&
              spaceDelimitedTypes.includes(lastDesc.type) &&
              spaceDelimitedTypes.includes(desc.type);

            if (spaceIsNecessary) {
              yield* eat(_);
            } else {
              yield* eatMatch(_);
            }
          }

          if (getState().hoisting === sym.leadingHoist) {
            yield* startNode();
          }
          returnValue = yield cmd;
          break;
        }

        case sym.reference: {
          if (getState().hoisting === sym.leadingHoist) {
            yield* startNode();
          }
          returnValue = yield cmd;
          break;
        }

        default:
          returnValue = yield cmd;
          break;
      }

      if (state.parent) {
        lastDescriptors.set(state.parent, lastDescriptors.get(state));
      }

      current = grammar.next(returnValue);
    }

    if (rootState.status !== 'rejected' && !rootState.hoisting) {
      yield* endNode();
    }
  }

  Object.defineProperty(WithWhitespace__, 'name', { value: `WithWhitespace_${visitor.name}` });

  return WithWhitespace__;
};

const withWhitespace = (visitors) => {
  const fragment = visitors[sym.Fragment];
  const transformed = {};
  for (const [type, visitor] of Object.entries(visitors)) {
    transformed[type] = WithWhitespace(visitor);
  }
  if (fragment) transformed[sym.Fragment] = fragment;
  return transformed;
};

export default {
  generators: withWhitespace({
    *[sym.Fragment]() {
      yield* startNode();
      yield* eat(ref`fragment`);
      yield* eatMatch(_);
      yield* endNode();
    },

    *Program(path) {
      const { body } = path.node;

      for (const _n of body) {
        yield* eat(ref`body`);
      }
    },

    *ImportDeclaration(path) {
      const { specifiers } = path.node;
      yield* eat(KW`import`);
      if (specifiers?.length) {
        const specialIdx = specifiers.findIndex((spec) => !t.isImportSpecifier(spec));
        if (specialIdx >= 1) {
          const special = specifiers[specialIdx];
          // This is a limitation of Resolver.
          throw new Error(
            `${special.type} was at specifiers[${specialIdx}] but must be specifiers[0]`,
          );
        }
        const special = t.isImportSpecifier(specifiers[0]) ? null : specifiers[0];
        if (special && t.isImportNamespaceSpecifier(special)) {
          yield* eat(ref`specifiers`);
        } else {
          if (special && t.isImportDefaultSpecifier(special)) {
            yield* eat(ref`specifiers`);
          }
          if (special && specifiers.length > 1) {
            yield* eat(PN`,`);
          }

          const restStart = special ? 1 : 0;

          if (specifiers.length > restStart) {
            yield* eat(LPN`{`);
            for (let i = restStart; i < specifiers.length; i++) {
              yield* eat(ref`specifiers`);
              const trailing = i === specifiers.length - 1;

              yield* trailing ? eatMatch(PN`,`) : eat(PN`,`);
            }
            yield* eat(RPN`}`);
          }
        }

        yield* eat(KW`from`);
      }
      yield* eat(ref`source`);
      yield* eatMatch(PN`;`);
    },

    *ImportSpecifier(path) {
      const { local, imported } = path.node;

      yield* eat(ref`imported`);

      if (local.name !== imported.name) {
        yield* eat(KW`as`, ref`local`);
      } else {
        yield* eatMatch(KW`as`, ref`local`);
      }
    },

    *ImportDefaultSpecifier() {
      yield* eat(ref`local`);
    },

    *ImportNamespaceSpecifier() {
      yield* eat(PN`*`, KW`as`, ref`local`);
    },

    *Literal(path) {
      const { value } = path.node;
      if (typeof value === 'string') {
        yield* eat(StringStart("'"), String(value), StringEnd("'"));
      }
    },

    *Identifier(path) {
      const { name } = path.node;
      yield* eat(Identifier(name));
    },
  }),
};
