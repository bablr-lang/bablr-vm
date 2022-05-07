const t = require('@babel/types');
const { notEmpty } = require('./utils/array.js');
const { ID, PN, KW, STR, ref, _ } = require('./types.js');

function* applyGrammar(node, builder) {
  const b = builder;

  // Always allow space before and after a node.
  // Parser's shouldn't do this, but people might.
  yield* b.allow(_);

  switch (node.type) {
    case 'Program': {
      const { body } = node;
      yield* b.allow(_);
      for (const _n of body) {
        yield* b.ensure(ref`body`);
        // How do we ensure that adding or removing a node doesn't destroy spacing?
        yield* b.allow(_);
      }
      break;
    }

    case 'ImportDeclaration': {
      const { specifiers } = node;
      yield* b.ensure(KW`import`);
      if (specifiers?.length) {
        const specialIdx = specifiers.findIndex((spec) => !t.isImportSpecifier(spec));
        if (specialIdx >= 1) {
          const special = specials[specialIdx];
          // This is a limitation of RefResolver.
          throw new Error(
            `${special.type} was at specifiers[${specialIdx}] but must be specifiers[0]`,
          );
        }
        const special = t.isImportSpecifier(specifiers[0]) ? null : specifiers[0];
        if (special && t.isImportNamespaceSpecifier(special)) {
          yield* b.allow(_);
          yield* b.ensure(ref`specifiers`);
        } else {
          if (special && t.isImportDefaultSpecifier(special)) {
            yield* b.ensure(_);
            yield* b.ensure(ref`specifiers`);
          }
          if (special && specifiers.length > 1) {
            yield* b.allow(_);
            yield* b.ensure(PN`,`);
            yield* b.allow(_);
          } else {
            yield* b.allow(_);
          }
          if (specifiers.length > 1) {
            yield* b.ensure(PN`{`);
            yield* b.allow(_);
            for (let i = 1; i < specifiers.length; i++) {
              const specifier = specifiers[i];
              // b.assert(t.isImportSpecifier(specifier));
              yield* b.ensure(ref`specifiers`);
              const trailing = i === specifiers.length - 1;

              yield* b.allow(_);
              yield* trailing ? b.allow(PN`,`) : b.ensure(PN`,`);
              yield* b.allow(_);
            }
            yield* b.ensure(PN`}`);
          }
        }
        yield* b.allow(_);
        yield* b.ensure(KW`from`);
        yield* b.allow(_);
      }
      yield* b.ensure(ref`source`);

      yield* b.allow(_);
      yield* b.allow(PN`;`);
      break;
    }

    case 'ImportSpecifier': {
      const { local, imported } = node;
      yield* b.ensure(ref`imported`);

      if (
        local.name !== imported.name ||
        // The original code likely looked like `{x as x}` so keep it
        (notEmpty(local.tokens) &&
          notEmpty(imported.tokens) &&
          local.tokens[0].type === 'Identifier' &&
          imported.tokens[0].type === 'Identifier' &&
          local.tokens[0].value === imported.tokens[0].value)
      ) {
        yield* b.ensure(_, ID`as`, _, ref`local`);
      }
      break;
    }

    case 'ImportDefaultSpecifier': {
      yield* b.ensure(ref`local`);
      break;
    }

    case 'ImportNamespaceSpecifier': {
      yield* b.ensure(PN`*`, _, ID`as`, _, ref`local`);
      break;
    }

    case 'Literal': {
      const { value } = node;
      yield* b.ensure(STR(value));
      break;
    }

    case 'Identifier': {
      const { name } = node;
      yield* b.ensure(ID(name));
      break;
    }
  }

  yield* b.allow(_);
}

module.exports = { applyGrammar };
