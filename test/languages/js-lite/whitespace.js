import { eatMatch, fail, startNode, endNode } from '@cst-tokens/helpers/grammar/node';
import { tok } from '@cst-tokens/helpers/shorthand';
import * as sym from '@cst-tokens/helpers/symbols';

const spaceDelimitedTypes = ['Identifier', 'Keyword'];

const lastTypes = new WeakMap();

const lastTypeFor = (s) => {
  return lastTypes.get(s) || (s.parent && lastTypes.get(s.parent)) || null;
};

export const WithWhitespace = ([type, production]) => {
  const name = `WithWhitespace_${production.name}`;

  let boundariesGenerated = false;

  return [
    type,
    {
      *[name](props, ...args) {
        const { path, state: s } = props;

        const generator = production(props, ...args);
        let current = generator.next();

        if (s.testCurrent(sym.StartNode)) {
        }

        while (!current.done) {
          const cmd = current.value;
          const cause = cmd.error;
          let returnValue;

          cmd.error = cause && new Error(undefined, { cause });

          const lastType = lastTypeFor(s);

          switch (cmd.type) {
            case sym.eat:
            case sym.match:
            case sym.eatMatch: {
              const edible = cmd.value;
              const { type } = edible.value;

              if (edible.type === sym.node) {
                // nothing to do
              } else {
                lastTypes.set(s, type);

                const spaceIsAllowed = s.lexicalContext === 'Bare';

                if (spaceIsAllowed) {
                  const spaceIsNecessary =
                    !!lastType &&
                    spaceDelimitedTypes.includes(lastType) &&
                    spaceDelimitedTypes.includes(type);

                  const matchedSeparator = !!(yield eatMatch(tok`Separator`));

                  if (spaceIsNecessary && !matchedSeparator) {
                    yield fail();
                  }
                }
              }

              returnValue = yield cmd;
              break;
            }

            case sym.startNode: {
              let sep, sn;

              if (lastTypeFor(s) !== 'Separator') {
                sep = yield eatMatch(tok`Separator`);
              }

              if (s.path !== path) {
                do {
                  if (s.testCurrent(sym.StartNode)) {
                    sn = yield startNode();
                    lastTypes.set(s, sym.StartNode);
                  }

                  sep = sn && (yield eatMatch(tok`Separator`));
                } while (sep && !sn);
              }

              if (s.path !== path) {
                sn = yield cmd;
                boundariesGenerated = true;
              }

              returnValue = sn;
              break;
            }

            case sym.endNode: {
              let sep, en;

              lastTypes.set(s, sym.EndNode);

              if (boundariesGenerated) {
                en = yield cmd;
              } else {
                if (lastTypeFor(s) !== 'Separator') {
                  sep = yield eatMatch(tok`Separator`);
                }

                do {
                  if (s.testCurrent(sym.EndNode)) {
                    en = yield endNode();
                    lastTypes.set(s, sym.EndNode);
                  }

                  sep = en && (yield eatMatch(tok`Separator`));
                } while (sep && !en);
              }

              if (!en) throw new Error();

              returnValue = en;
              break;
            }

            default:
              returnValue = yield cmd;
              break;
          }

          current = generator.next(returnValue);
        }
      },
    }[name],
  ];
};
