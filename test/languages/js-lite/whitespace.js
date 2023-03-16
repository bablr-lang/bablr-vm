import { eatMatch, fail, startNode, endNode } from '@cst-tokens/helpers/grammar';
import { tok } from '@cst-tokens/helpers/shorthand';
import * as sym from '@cst-tokens/helpers/symbols';

const spaceDelimitedTypes = ['Identifier', 'Keyword'];

const boundariesGenerated = new WeakMap();
const lastTypes = new WeakMap();

const lastTypeFor = (s) => {
  return lastTypes.get(s) || (s.parent && lastTypes.get(s.parent)) || null;
};

export const WithWhitespace = ([type, production]) => {
  const name = `WithWhitespace_${production.name}`;

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

                if (lastType === 'Separator') {
                  // nothing to do
                } else {
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
              }

              returnValue = yield cmd;
              break;
            }

            case sym.startNode: {
              let sep, sn;

              if (s.path !== path && s.testCurrent(sym.StartNode)) {
                sn = yield startNode();
                lastTypes.set(s, sym.StartNode);
              }
              do {
                if (s.path !== path) {
                  sn = yield startNode();
                  lastTypes.set(s, sym.StartNode);
                }
                if (lastTypeFor(s) === 'Separator') {
                  sep = yield eatMatch(tok`Separator`);
                }
              } while (sep);

              if (!sn) {
                yield cmd;
                boundariesGenerated.set(path, true);
              }

              returnValue = sn;
              break;
            }

            case sym.endNode: {
              let sep, en;

              lastTypes.set(s, sym.EndNode);

              if (boundariesGenerated.get(path)) {
                yield cmd;
              } else {
                if (s.path !== path && s.testCurrent(sym.endNode)) {
                  en = yield endNode();
                  lastTypes.set(s, sym.EndNode);
                }
                do {
                  if (s.path !== path) {
                    en = yield endNode();
                    lastTypes.set(s, sym.EndNode);
                  }
                  if (lastTypeFor(s) === 'Separator') {
                    sep = yield eatMatch(tok`Separator`);
                  }
                } while (sep);
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
