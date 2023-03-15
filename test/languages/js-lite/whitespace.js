import { eatMatch, fail } from '@cst-tokens/helpers/grammar';
import { tok } from '@cst-tokens/helpers/shorthand';
import * as sym from '@cst-tokens/helpers/symbols';

const getPreviousRealToken = (token, context) => {
  let real = token;
  while (real && (real.type === 'StartNode' || real.type === 'EndNode')) {
    real = context.getPreviousToken(real);
  }
  return real || null;
};

const spaceDelimitedTypes = ['Identifier', 'Keyword'];

export const WithWhitespace = ([type, production]) => {
  const name = `WithWhitespace_${production.name}`;

  return [
    type,
    {
      *[name](props, ...args) {
        const { getState, context } = props;
        const { tokenGrammar } = context;

        const generator = production(props, ...args);
        let current = generator.next();
        let s = getState();

        if (s.testCurrent(sym.StartNode)) {
        }

        while (!current.done) {
          const cmd = current.value;
          const cause = cmd.error;
          let returnValue;

          cmd.error = cause && new Error(undefined, { cause });

          s = getState();

          switch (cmd.type) {
            case sym.eat:
            case sym.match:
            case sym.eatMatch: {
              const edible = cmd.value;
              const { type } = edible.value;
              let lastType = getPreviousRealToken(getState().result, context)?.type;

              const spaceIsAllowed = s.lexicalContext === 'Bare';

              if (spaceIsAllowed) {
                const spaceIsNecessary =
                  !!lastType &&
                  spaceDelimitedTypes.includes(lastType) &&
                  spaceDelimitedTypes.includes(type);

                let matchedSeparator = s.result && tokenGrammar.is('Trivia', s.result.type);

                if (!matchedSeparator) {
                  // use edible.type and partial range to decide whether to match tok`Separator` or node`Separator`
                  matchedSeparator = !!(yield eatMatch(tok`Separator`));
                }

                if (spaceIsNecessary && !matchedSeparator) {
                  yield fail();
                }
              }
              // fallthrough
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
