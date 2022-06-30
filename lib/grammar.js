const t = require('@babel/types');
const { arrayLast } = require('iter-tools-es');
const { nodeTokensEqual } = require('./utils/cst.js');
const { ID, PN, KW, STR, ref, _ } = require('./descriptors.js');
const { take, takeMatch, match, emit } = require('./commands.js');

const visitors = {
  *Program(node) {
    const { body } = node;
    yield takeMatch(_);
    for (const _n of body) {
      yield take(ref`body`);
      yield takeMatch(_);
    }
  },

  *ImportDeclaration(node) {
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
        yield takeMatch(_);
        yield take(ref`specifiers`);
      } else {
        if (special && t.isImportDefaultSpecifier(special)) {
          yield take(_);
          yield take(ref`specifiers`);
        }
        if (special && specifiers.length > 1) {
          yield takeMatch(_);
          yield take(PN`,`);
          yield takeMatch(_);
        } else {
          yield takeMatch(_);
        }
        if (specifiers.length > 1) {
          yield take(PN`{`);
          yield takeMatch(_);
          for (let i = 1; i < specifiers.length; i++) {
            yield take(ref`specifiers`);
            const trailing = i === specifiers.length - 1;

            yield takeMatch(_);
            yield trailing ? takeMatch(PN`,`) : take(PN`,`);
            yield takeMatch(_);
          }

          yield take(PN`}`);
        }
      }
      yield takeMatch(_);
      yield take(KW`from`);
      yield takeMatch(_);
    }
    yield take(ref`source`);
    yield takeMatch(_, PN`;`);
  },

  *ImportSpecifier(node, { refs }) {
    const { local, imported } = node;

    const importedMatch = yield match(ref`imported`);
    const importedRef = importedMatch[0];

    yield emit(importedMatch);

    if (local.name !== imported.name) {
      yield take(_, ID`as`, _, ref`local`);
    } else {
      const asMatch = yield match(_, ID`as`, _, ref`local`);
      const localRef = arrayLast(asMatch);

      // Ensure that `foo as bar` becoming `foo as foo` only emits `foo`
      const valid =
        nodeTokensEqual(imported, refs.get(importedRef)) &&
        nodeTokensEqual(local, refs.get(localRef));

      if (asMatch && valid) {
        yield emit(asMatch);
      }
    }
  },

  *ImportDefaultSpecifier(node) {
    yield take(ref`local`);
  },

  *ImportNamespaceSpecifier(node) {
    yield take(PN`*`, _, ID`as`, _, ref`local`);
  },

  *Literal(node) {
    const { value } = node;
    if (typeof value === 'string') {
      yield take(STR(value));
    }
  },

  *Identifier(node) {
    const { name } = node;
    yield take(ID(name));
  },
};

module.exports = { visitors };
