import { match, eatMatch, fail } from '@cst-tokens/helpers/grammar/node';
import { tok, chrs } from '@cst-tokens/helpers/shorthand';
import { mapProductions } from '@cst-tokens/helpers/enhancers';
import * as sym from '@cst-tokens/helpers/symbols';

const spaceDelimitedTypes = ['Identifier', 'Keyword'];

const getlastRealToken = (context, s) => {
  let token = s.lastToken;
  while (token.type === sym.startNode || token.type === sym.endNode) {
    token = context.getPreviousToken(token);
  }
  return token;
};

const requiresSeparator = (context, s, type) => {
  return (
    !!s.lastToken &&
    spaceDelimitedTypes.includes(getlastRealToken(context, s).type) &&
    spaceDelimitedTypes.includes(type)
  );
};

export const triviaPattern = /\s|\/\*|\/\//y;

function* eatSep() {
  const guardMatch = yield match(chrs(triviaPattern));
  if (guardMatch) yield eatMatch(tok('Separator', { guardMatch }));
}

export const triviaEnhancer = (grammar) => {
  return mapProductions((production) => {
    let { annotations } = production;

    return {
      ...production,
      annotations,
      *match(props, ...args) {
        const { state: s, context: ctx } = props;

        const generator = production.match(props, ...args);

        try {
          let current = generator.next();

          while (!current.done) {
            const instr = current.value;
            const cause = instr.error;
            let returnValue;

            instr.error = cause && new Error(undefined, { cause });

            switch (instr.type) {
              case sym.match: {
                const { matchable, failureEffect } = instr.value;
                const { type } = matchable.value;

                if (matchable.type === sym.token) {
                  const spaceIsAllowed = s.lexicalContext === 'Bare';

                  if (spaceIsAllowed) {
                    const matchedSeparator =
                      s.lastToken.type === 'EndComment' ||
                      s.lastToken.type === 'Whitespace' ||
                      !!(yield* eatSep());

                    if (requiresSeparator(ctx, s, type) && !matchedSeparator) {
                      if (failureEffect === sym.fail) {
                        yield fail();
                      } else {
                        returnValue = null;
                      }
                    }
                  }
                }

                returnValue = returnValue || (yield instr);
                break;
              }

              default:
                returnValue = yield instr;
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
