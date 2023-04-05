import { eatMatch, fail, startNode, endNode } from '@cst-tokens/helpers/grammar/node';
import { tok } from '@cst-tokens/helpers/shorthand';
import { regexFromPattern } from '@cst-tokens/helpers/regex';
import { isFunction } from '@cst-tokens/helpers/object';
import { mapProductions } from '@cst-tokens/helpers/enhancers';
import * as sym from '@cst-tokens/helpers/symbols';

const spaceDelimitedTypes = ['Identifier', 'Keyword'];

const getGuardPattern = (guard, props) => {
  const guard_ = isFunction(guard) ? guard(props) : guard;

  return regexFromPattern(guard_);
};

const getlastRealToken = (context, s) => {
  let token = s.result;
  while (token.type === sym.startNode || token.type === sym.endNode) {
    token = context.getPreviousToken(token);
  }
  return token;
};

const requiresSeparator = (context, s, type) => {
  return (
    !!s.result.size &&
    spaceDelimitedTypes.includes(getlastRealToken(s).type) &&
    spaceDelimitedTypes.includes(type)
  );
};

export const triviaEnhancer = (grammar) => {
  return mapProductions((production) => {
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
        const { state: s, context: ctx } = props;
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

            switch (cmd.type) {
              case sym.eat:
              case sym.match:
              case sym.eatMatch: {
                const edible = cmd.value;
                const { type } = edible.value;

                if (edible.type === sym.node) {
                  // nothing to do
                } else {
                  const spaceIsAllowed = s.lexicalContext === 'Bare';

                  if (spaceIsAllowed) {
                    const matchedSeparator =
                      s.result.type === 'EndComment' ||
                      s.result.type === 'Whitespace' ||
                      !!(yield eatMatch(tok`Separator`));

                    if (requiresSeparator(ctx, s, type) && !matchedSeparator) {
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

                sep = yield eatMatch(tok`Separator`);

                if (s.path === outerPath) {
                  do {
                    if (s.testCurrent(sym.StartNode)) {
                      sn = yield startNode();
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

                if (boundariesGenerated) {
                  en = yield cmd;
                } else {
                  sep = yield eatMatch(tok`Separator`);

                  do {
                    if (s.testCurrent(sym.EndNode)) {
                      en = yield endNode();
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
  }, grammar);
};
