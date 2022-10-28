import t from '@babel/types';
import { eat, eatMatch, ref, LineBreak, Bag } from '@cst-tokens/helpers';
import {
  Fragment,
  eatGrammar as eatGrammar_,
  matchGrammar as matchGrammar_,
  eatMatchGrammar as eatMatchGrammar_,
  eat as eat_,
  match as match_,
  eatMatch as eatMatch_,
} from '@cst-tokens/helpers/symbols';
import {
  PN,
  LPN,
  RPN,
  KW,
  Identifier,
  String,
  StringStart,
  StringEnd,
  Whitespace,
} from './js-descriptors.mjs';
export { parseModule as parse } from 'meriyah';

export function* _(path, context, getState) {
  return getState().source ? yield* Bag([Whitespace(), LineBreak()]) : [Whitespace().build()];
}

const spaceDelimitedTypes = ['Identifier', 'Keyword'];

const lastDescriptors = new WeakMap();

export const WithWhitespace = (visitor) => {
  function* WithWhitespace__(path, context, getState) {
    const grammar = visitor(path, context, getState);
    let current = grammar.next();
    let state;

    while (!current.done) {
      const cmd = current.value;
      const cause = cmd.error;
      let returnValue;

      cmd.error = cause && new Error(undefined, { cause });

      state = getState();

      switch (cmd.type) {
        case eatGrammar_:
        case matchGrammar_:
        case eatMatchGrammar_: {
          returnValue = yield { ...cmd, value: WithWhitespace(cmd.value) };
          break;
        }

        case eat_:
        case match_:
        case eatMatch_: {
          const desc = cmd.value;
          const lastDesc =
            lastDescriptors.get(state) || (state.parent && lastDescriptors.get(state.parent));

          if (cmd.type !== match_) {
            lastDescriptors.set(state, desc);
          }

          const spaceIsNecessary =
            !!lastDesc &&
            spaceDelimitedTypes.includes(lastDesc.type) &&
            spaceDelimitedTypes.includes(desc.type);

          if (spaceIsNecessary) {
            yield* eat(_);
          } else {
            yield* eatMatch(_);
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
  }

  Object.defineProperty(WithWhitespace__, 'name', { value: `WithWhitespace_${visitor.name}` });

  return WithWhitespace__;
};

const withWhitespace = (visitors) => {
  const fragment = visitors[Fragment];
  const transformed = {};
  for (const [type, visitor] of Object.entries(visitors)) {
    transformed[type] = WithWhitespace(visitor);
  }
  if (fragment) transformed[Fragment] = fragment;
  return transformed;
};

export default {
  generators: withWhitespace({
    *[Fragment]() {
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
      const { name } = path.node;
      yield* eat(Identifier(name));
    },
  }),
};
