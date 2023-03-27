import { eatMatch, fail, startNode, endNode } from '@cst-tokens/helpers/grammar/node';
import { tok } from '@cst-tokens/helpers/shorthand';
import { regexFromPattern } from '@cst-tokens/helpers/regex';
import { isFunction } from '@cst-tokens/helpers/object';
import * as sym from '@cst-tokens/helpers/symbols';

const spaceDelimitedTypes = ['Identifier', 'Keyword'];

const lastTypes = new WeakMap();

const lastTypeFor = (s) => {
  return lastTypes.get(s) || (s.parent && lastTypes.get(s.parent)) || null;
};

const getGuardPattern = (guard, props) => {
  const guard_ = isFunction(guard) ? guard(props) : guard;

  return regexFromPattern(guard_);
};

export const WithWhitespace = (production) => {
  let { annotations } = production;

  const baseGuard = annotations?.get('guard');

  if (baseGuard) {
    annotations.set('guard', (props) => {
      const s = props.state;
      const basePattern = baseGuard && getGuardPattern(baseGuard, props);

      return s.lexicalContext === 'Bare' && basePattern
        ? new RegExp(`${/\/\*|\/\/|\s/.source}|${basePattern.source}`, 'y')
        : basePattern;
    });
  }

  let boundariesGenerated = false;

  return {
    ...production,
    annotations,
    *match(props, ...args) {
      const { state: s } = props;
      const outerPath = s.path;

      // props.guardMatch = ??

      const generator = production.match(props, ...args);

      try {
        let current = generator.next();

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
                    if (cmd.type === sym.eat) {
                      yield fail();
                    } else {
                      returnValue = null;
                    }
                  }
                }
              }

              returnValue = returnValue || (yield cmd);
              break;
            }

            case sym.startNode: {
              let sep, sn;

              if (lastTypeFor(s) !== 'Separator') {
                sep = yield eatMatch(tok`Separator`);
              }

              if (s.path === outerPath) {
                do {
                  if (s.testCurrent(sym.StartNode)) {
                    sn = yield startNode();
                    lastTypes.set(s, sym.StartNode);
                  }

                  sep = sn && (yield eatMatch(tok`Separator`));
                } while (sep && !sn);
              }

              if (s.path === outerPath) {
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
      } catch (e) {
        generator.throw(e);
      }
    },
  };
};
