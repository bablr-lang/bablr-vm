const { WS, ID, PN, KW, ref, CMT } = require('./types.js');
const { ReprintBuilder, MinimalBuilder } = require('./builders.js');

const { isArray } = Array;

const notEmpty = (arr) => arr != null && arr.length > 0;

const ws = WS();
const cmt = CMT();

const _ = {
  type: 'Thunk',
  *allow(b) {
    let wsToken, cmtToken;
    do {
      [wsToken = null] = yield* b.allow(ws);
      [cmtToken = null] = yield* b.allow(cmt);
    } while (cmtToken || wsToken);
  },
  *ensure(b) {
    let wsToken, cmtToken;
    let ensured = false;
    do {
      [wsToken = null] = yield* b.allow(ws);
      [cmtToken = null] = yield* b.allow(cmt);
      ensured = ensured || !!wsToken || !!cmtToken;
    } while (cmtToken || wsToken);
    if (!ensured) {
      yield* b.ensure(WS` `);
    }
  },
};

function* tokens(node) {
  const b = node.tokens
    ? // emits ensured tokens and allowed tokens that are present in node.tokens
      new ReprintBuilder(node.tokens)
    : // emits only ensured tokens
      new MinimalBuilder();

  switch (node.type) {
    case 'ImportDeclaration': {
      const { specifiers } = node;
      yield* b.ensure(KW`import`);
      if (specifiers?.length) {
        // Specials must be at the beginning because our reference tokens don't index inside arrays
        // I should probably fix this somehow...
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
              b.assert(t.isImportSpecifier(specifier));
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

    case 'Identifier': {
      const { name } = node;
      yield* b.ensure(ID(name));
      break;
    }
  }
}

function* flatTokens(element) {
  const counters = Object.create(null); // {[property]: counter}

  for (const token of tokens(element)) {
    if (token.type === 'reference') {
      const { name } = token;

      let referenced = element[name];
      if (isArray(referenced)) {
        const count = counters[name] || 0;
        referenced = referenced[count];
        counters[name] = count + 1;
      }

      yield* traverseTokens(referenced);
    } else {
      yield* token;
    }
  }
}

module.exports = { tokens, flatTokens };
