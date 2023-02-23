import { eat, eatMatch } from '@cst-tokens/helpers/grammar';
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

export const WithWhitespace = ([key, production]) => {
  const name = `WithWhitespace_${production.name}`;

  return [
    key,
    {
      *[name](props, ...args) {
        const { getState, context } = props;

        const generator = production(props, ...args);
        let current = generator.next();
        let state;

        while (!current.done) {
          const cmd = current.value;
          const cause = cmd.error;
          let returnValue;

          cmd.error = cause && new Error(undefined, { cause });

          state = getState();

          switch (cmd.type) {
            case sym.eat:
            case sym.match:
            case sym.eatMatch: {
              const edible = cmd.value;
              const { type } = edible.value;
              let lastType = getPreviousRealToken(getState().result, context)?.type;

              const spaceIsAllowed = state.lexicalContext === 'Bare';

              if (spaceIsAllowed) {
                const spaceIsNecessary =
                  !!lastType &&
                  spaceDelimitedTypes.includes(lastType) &&
                  spaceDelimitedTypes.includes(type);

                if (spaceIsNecessary) {
                  yield eat(tok`Separator`);
                } else {
                  yield eatMatch(tok`Separator`);
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
