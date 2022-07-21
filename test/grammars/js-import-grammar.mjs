import t from '@babel/types';
import { arrayLast } from 'iter-tools-es';
import { take, match, emit } from 'cst-tokens/commands';
import { OPT, ID, PN, KW, STR, ref, _, __ } from './js-descriptors.mjs';

export default {
  *Program(path) {
    const { node } = path;
    const { body } = node;
    yield take(_);
    for (const _n of body) {
      yield take(ref`body`, _);
    }
  },

  *ImportDeclaration(path) {
    const { node } = path;
    const { specifiers } = node;
    yield take(KW`import`);
    if (specifiers?.length) {
      const specialIdx = specifiers.findIndex((spec) => !t.isImportSpecifier(spec));
      if (specialIdx >= 1) {
        const special = specifiers[specialIdx];
        // This is a limitation of RefResolver.
        throw new Error(
          `${special.type} was at specifiers[${specialIdx}] but must be specifiers[0]`,
        );
      }
      const special = t.isImportSpecifier(specifiers[0]) ? null : specifiers[0];
      if (special && t.isImportNamespaceSpecifier(special)) {
        yield take(_, ref`specifiers`);
      } else {
        if (special && t.isImportDefaultSpecifier(special)) {
          yield take(__, ref`specifiers`);
        }
        if (special && specifiers.length > 1) {
          yield take(_, PN`,`, _);
        } else {
          yield take(_);
        }
        if (specifiers.length > 1) {
          yield take(PN`{`, _);
          for (let i = 1; i < specifiers.length; i++) {
            yield take(ref`specifiers`);
            const trailing = i === specifiers.length - 1;

            yield take(_, trailing ? OPT(PN`,`) : PN`,`, _);
          }
          yield take(PN`}`);
        }
      }

      const needsSpace = specialIdx === 0 && specifiers.length === 1;
      yield take(needsSpace ? __ : _, KW`from`, _);
    }
    yield take(ref`source`, _, OPT(PN`;`));
  },

  *ImportSpecifier(path, { matchNodes }) {
    const { node } = path;
    const { local, imported } = node;

    const importedMatch = yield match(ref`imported`);
    const importedRef = importedMatch[0];

    yield emit(importedMatch);

    if (local.name !== imported.name) {
      yield take(__, ID`as`, __, ref`local`);
    } else {
      const asMatch = yield match(__, ID`as`, __, ref`local`);
      const localRef = arrayLast(asMatch);

      // Ensure that `foo as bar` becoming `foo as foo` only emits `foo`
      const valid =
        matchNodes.get(importedRef).source.type !== 'NoSource' &&
        matchNodes.get(localRef).source.type !== 'NoSource';

      if (asMatch && valid) {
        yield emit(asMatch);
      }
    }
  },

  *ImportDefaultSpecifier() {
    yield take(ref`local`);
  },

  *ImportNamespaceSpecifier() {
    yield take(PN`*`, _, ID`as`, __, ref`local`);
  },

  *Literal(path) {
    const { node } = path;
    const { value } = node;
    if (typeof value === 'string') {
      yield take(STR(value));
    }
  },

  *Identifier(path) {
    const { node } = path;
    const { name } = node;
    yield take(ID(name));
  },
};
