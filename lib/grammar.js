const t = require('@babel/types');
const { notEmpty } = require('./utils/array.js');
const { hasRange } = require('./utils/range.js');
const { NodeTokensSource, NoSource, OriginalTextSource } = require('./sources/index.js');
const { ID, PN, KW, STR, ref, _ } = require('./tokens.js');

/**
 * Gets the best source for existing token information
 */
const sourceFor = (node, options) => {
  // prettier-ignore
  return node.tokens
    ? NodeTokensSource
    : options.sourceText && hasRange(node)
      ? OriginalTextSource
      : NoSource;
};

function* generateTokens(node, options) {
  const { Source = sourceFor(node, options) } = options;
  const s = new Source(node, options);

  // Always allow space before and after a node.
  // Parsers shouldn't do this, but people might.
  yield* s.allow(_);

  switch (node.type) {
    case 'Program': {
      const { body } = node;
      yield* s.allow(_);
      for (const _n of body) {
        yield* s.ensure(ref`body`);
        // How do we ensure that adding or removing a node doesn't destroy spacing?
        yield* s.allow(_);
      }
      break;
    }

    case 'ImportDeclaration': {
      const { specifiers } = node;
      yield* s.ensure(KW`import`);
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
          yield* s.allow(_);
          yield* s.ensure(ref`specifiers`);
        } else {
          if (special && t.isImportDefaultSpecifier(special)) {
            yield* s.ensure(_);
            yield* s.ensure(ref`specifiers`);
          }
          if (special && specifiers.length > 1) {
            yield* s.allow(_);
            yield* s.ensure(PN`,`);
            yield* s.allow(_);
          } else {
            yield* s.allow(_);
          }
          if (specifiers.length > 1) {
            yield* s.ensure(PN`{`);
            yield* s.allow(_);
            for (let i = 1; i < specifiers.length; i++) {
              const specifier = specifiers[i];
              // s.assert(t.isImportSpecifier(specifier));
              yield* s.ensure(ref`specifiers`);
              const trailing = i === specifiers.length - 1;

              yield* s.allow(_);
              yield* trailing ? s.allow(PN`,`) : s.ensure(PN`,`);
              yield* s.allow(_);
            }
            yield* s.ensure(PN`}`);
          }
        }
        yield* s.allow(_);
        yield* s.ensure(KW`from`);
        yield* s.allow(_);
      }
      yield* s.ensure(ref`source`);

      yield* s.allow(_);
      yield* s.allow(PN`;`);
      break;
    }

    case 'ImportSpecifier': {
      const { local, imported } = node;
      yield* s.ensure(ref`imported`);

      if (
        local.name !== imported.name ||
        // The original code likely looked like `{x as x}` so keep it
        (notEmpty(local.tokens) &&
          notEmpty(imported.tokens) &&
          local.tokens[0].type === 'Identifier' &&
          imported.tokens[0].type === 'Identifier' &&
          local.tokens[0].value === imported.tokens[0].value)
      ) {
        yield* s.ensure(_, ID`as`, _, ref`local`);
      }
      break;
    }

    case 'ImportDefaultSpecifier': {
      yield* s.ensure(ref`local`);
      break;
    }

    case 'ImportNamespaceSpecifier': {
      yield* s.ensure(PN`*`, _, ID`as`, _, ref`local`);
      break;
    }

    case 'Literal': {
      const { value } = node;
      yield* s.ensure(STR(value));
      break;
    }

    case 'Identifier': {
      const { name } = node;
      yield* s.ensure(ID(name));
      break;
    }
  }

  yield* s.allow(_);
}

module.exports = { generateTokens };
