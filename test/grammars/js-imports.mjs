import t from '@babel/types';
import { eat, eatMatch, startNode, endNode } from '@cst-tokens/helpers/commands';
import { Bag } from '@cst-tokens/helpers/meta-productions';
import { LineBreak } from '@cst-tokens/helpers/descriptors';
import { ref, PN, LPN, RPN, KW } from '@cst-tokens/helpers/shorthand';
import * as sym from '@cst-tokens/helpers/symbols';
import {
  SymbolReference,
  SymbolDefinition,
  StringStart,
  StringEnd,
  String,
  Whitespace,
} from './js-descriptors.mjs';
export { parseModule as parse } from 'meriyah';

export function* _(path, grammar, getState) {
  return getState().source ? yield* eat(Bag([Whitespace(), LineBreak()])) : [Whitespace().build()];
}

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

export const WithWhitespace = (production) => {
  function* WithWhitespace__(path, grammar, getState) {
    const generator = production(path, grammar, getState);
    const rootState = getState();
    let current = generator.next();
    let state;

    while (!current.done) {
      const cmd = current.value;
      const cause = cmd.error;
      let returnValue;

      cmd.error = cause && new Error(undefined, { cause });

      state = getState();

      switch (cmd.type) {
        case sym.eatProduction:
        case sym.matchProduction:
        case sym.eatMatchProduction: {
          // I'm not able to propagate my custom state through this statement!
          // I have no access to the child state form outside
          // I have no access to the parent state from inside
          returnValue = yield {
            ...cmd,
            value: path.node.type === 'CSTFragment' ? cmd.value : WithWhitespace(cmd.value),
          };
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

          let s = getState();
          while (s.hoist) {
            yield* startNode();
            s = getState();
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

      current = generator.next(returnValue);
    }

    if (rootState.status !== 'rejected' && !rootState.hoist) {
      yield* endNode();
    }
  }

  Object.defineProperty(WithWhitespace__, 'name', { value: `WithWhitespace_${production.name}` });

  return WithWhitespace__;
};

const withWhitespace = (visitors) => {
  const { CSTFragment } = visitors;
  const transformed = {};
  if (CSTFragment) transformed.CSTFragment = CSTFragment;
  for (const [type, visitor] of Object.entries(visitors)) {
    transformed[type] = WithWhitespace(visitor);
  }
  return transformed;
};

export default {
  productions: withWhitespace({
    *CSTFragment() {
      yield* eat(ref`fragment`);
      yield* eatMatch(_);
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
      const { node, parent } = path;
      const { name } = node;
      const Symbol = parent.node.local === node ? SymbolReference : SymbolDefinition;

      yield* eat(Symbol(name));
    },
  }),
};
