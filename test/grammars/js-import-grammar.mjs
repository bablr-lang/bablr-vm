import t from '@babel/types';
import { match, take, takeMatch, emit, ref } from 'cst-tokens/commands';
import { ID, PN, LPN, RPN, KW, _, Text } from './js-descriptors.mjs';

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

    lastDescriptors.set(state, lastDescriptors.get(state.path.parentState));

    while (!current.done) {
      const command = current.value;
      let returnValue;

      switch (command.type) {
        case 'branch': {
          returnValue = state = yield command;
          lastDescriptors.set(state, lastDescriptors.get(state.parent || state));
          break;
        }

        case 'accept': {
          lastDescriptors.set(state.parent, lastDescriptors.get(state));
          returnValue = state = yield command;
          break;
        }

        case 'reject':
        case 'fail': {
          returnValue = state = yield command;
          break;
        }

        case 'match': {
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

            const spaceTokens = yield { type: 'match', value: _ };

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

    if (state.path.parentState) {
      lastDescriptors.set(state.path.parentState, lastDescriptors.get(state));
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
  visitors: mapVisitors(handleWhitespace, {
    *Program(path) {
      const { body } = path.node;

      for (const _n of body) {
        yield* take(ref`body`);
      }
      yield* takeMatch(_);
    },

    *ImportDeclaration(path) {
      const { specifiers } = path.node;
      yield* take(KW`import`);
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
          yield* take(ref`specifiers`);
        } else {
          if (special && t.isImportDefaultSpecifier(special)) {
            yield* take(ref`specifiers`);
          }
          if (special && specifiers.length > 1) {
            yield* take(PN`,`);
          }
          if (specifiers.length > 1) {
            yield* take(LPN`{`);
            for (let i = 1; i < specifiers.length; i++) {
              yield* take(ref`specifiers`);
              const trailing = i === specifiers.length - 1;

              yield* trailing ? takeMatch(PN`,`) : take(PN`,`);
            }
            yield* take(RPN`}`);
          }
        }

        yield* take(KW`from`);
      }
      yield* take(ref`source`);
      yield* takeMatch(PN`;`);
    },

    *ImportSpecifier(path, context) {
      const { matchNodes } = context;
      const { local, imported } = path.node;

      const importedMatch = yield* take(ref`imported`);

      if (local.name !== imported.name) {
        yield* take(ID`as`, ref`local`);
      } else {
        // whitespace plugin sends
        const asMatch = yield* match(ID`as`, ref`local`);

        // Ensure that `foo as bar` becoming `foo as foo` only emits `foo`
        const valid =
          asMatch &&
          matchNodes.get(getRef(importedMatch)).sourceType !== 'NoSource' &&
          matchNodes.get(getRef(asMatch)).sourceType !== 'NoSource';

        if (valid) {
          yield* emit(asMatch);
        }
      }
    },

    *ImportDefaultSpecifier() {
      yield* take(ref`local`);
    },

    *ImportNamespaceSpecifier() {
      yield* take(PN`*`, ID`as`, ref`local`);
    },

    *Literal(path) {
      const { value } = path.node;
      if (typeof value === 'string') {
        yield* take(LPN`'`, Text(value), RPN`'`);
      }
    },

    *Identifier(path) {
      const { name } = path.node;
      yield* take(ID(name));
    },
  }),
};
