import t from '@babel/types';
import { match, eat, eatMatch, emit, ref } from '@cst-tokens/helpers';
import {
  PN,
  LPN,
  RPN,
  KW,
  _,
  Identifier,
  String,
  StringStart,
  StringEnd,
} from './js-descriptors.mjs';

const spaceDelimitedTypes = ['Identifier', 'Keyword'];

function concatTokens(...args) {
  let tokens = [];
  for (const arg of args) {
    if (arg) {
      tokens.push(...arg);
    }
  }
  return tokens.length ? tokens : null;
}

const getRef = (arr) => arr.find((value) => value.type === 'Reference');

const lastDescriptors = new WeakMap();

export const handleWhitespace = (visitor) =>
  function* handleWhitespace(path, context, initialState) {
    const grammar = visitor(path, context, initialState);
    let current = grammar.next();
    let state = initialState;

    while (!current.done) {
      const command = current.value;
      const cause = command.error;
      let returnValue;

      command.error = cause && new Error(undefined, { cause });

      switch (command.type) {
        case 'branch': {
          returnValue = state = yield command;
          lastDescriptors.set(state, lastDescriptors.get(state.parent || state.path.parentState));
          break;
        }

        case 'accept': {
          lastDescriptors.set(state.parent || state.path.parentState, lastDescriptors.get(state));
          returnValue = state = yield command;
          break;
        }

        case 'reject':
        case 'fail': {
          returnValue = state = yield command;
          break;
        }

        case 'take': {
          const descriptor = command.value;
          const { type } = descriptor;
          const lastType = lastDescriptors.get(state)?.type;

          if (type === 'Reference') {
            returnValue = yield command;
          } else {
            lastDescriptors.set(state, descriptor);

            const spaceIsNecessary =
              !!lastType &&
              spaceDelimitedTypes.includes(lastType) &&
              spaceDelimitedTypes.includes(type);

            const spaceTokens = yield { type: 'take', value: _ };

            if (spaceIsNecessary && !spaceTokens) {
              returnValue = null;
            } else {
              const commandTokens = yield command;

              // The requestor didn't ask for these space tokens to be matched
              // They just end up interspersed with the tokens they did ask for
              // The whitespace tokens are always prefixes
              // We must return the spaces in the match though or they'd never be emitted
              const tokens = concatTokens(spaceTokens, commandTokens);

              returnValue = tokens;
            }
          }
          break;
        }

        default: {
          returnValue = yield command;
          break;
        }
      }

      current = grammar.next(returnValue);
    }
  };

const mapVisitors = (transform, visitors) => {
  const transformed = {};
  for (const [type, visitor] of Object.entries(visitors)) {
    transformed[type] = transform(visitor);
  }
  return transformed;
};

export default {
  isHoistable(token) {
    return (
      token.type === 'Whitespace' || (token.type === 'Punctuator' && '()'.includes(token.value))
    );
  },
  generators: mapVisitors(handleWhitespace, {
    *Program(path) {
      const { body } = path.node;

      for (const _n of body) {
        yield* eat(ref`body`);
      }
      yield* eatMatch(_);
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
          if (specifiers.length > 1) {
            yield* eat(LPN`{`);
            for (let i = 1; i < specifiers.length; i++) {
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

    *ImportSpecifier(path, context) {
      const { matchNodesByRef } = context;
      const { local, imported } = path.node;

      const importedMatch = yield* eat(ref`imported`);

      if (local.name !== imported.name) {
        yield* eat(KW`as`, ref`local`);
      } else {
        const asMatch = yield* match(KW`as`, ref`local`);

        // Ensure that `foo as bar` becoming `foo as foo` only emits `foo`
        const valid =
          asMatch &&
          matchNodesByRef.get(getRef(importedMatch)).source.type !== 'NoSource' &&
          matchNodesByRef.get(getRef(asMatch)).source.type !== 'NoSource';

        if (valid) {
          yield* emit(asMatch);
        }
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
