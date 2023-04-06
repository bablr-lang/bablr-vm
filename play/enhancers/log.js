import { mapProductions } from '@cst-tokens/helpers/productions';
import * as sym from '@cst-tokens/helpers/symbols';

const isString = (val) => typeof val === 'string';

export const formatType = (type) => {
  return type === undefined
    ? ''
    : type === null
    ? 'null'
    : type === sym.fail
    ? 'fail 🐳'
    : typeof type === 'symbol'
    ? type.description.replace(/^cst-tokens\//, '')
    : `'${type.replace(/['\\]/g, '\\$&')}'`;
};

const productionTypes = new WeakMap();

// Polyglot syntax/node enhancer
export const logEnhancer = (grammar) => {
  return mapProductions((production) => {
    const { type } = production;

    return {
      ...production,
      *match(props, grammar, next) {
        const { state, context } = props;
        const { productionType } = state;

        if (!productionTypes.has(context)) {
          productionTypes.set(context, sym.node);
        }

        const i = (strings, ...args) => {
          const indentation = ' '.repeat((1 + state.depth) * 2);
          const content = String.raw(strings, ...args);
          return `${indentation}${content}`;
        };

        const tokenizerTransition = productionTypes.get(context) !== productionType;

        if (tokenizerTransition) {
          productionTypes.set(context, sym.token);
        }

        console.log(i`${tokenizerTransition ? '>>>' : '-->'} ${formatType(type)}`);

        let normalCompletion = false;
        try {
          const generator = production.match(props, grammar, next);
          let current = generator.next();

          let anyResult = false;

          while (!current.done) {
            const instr = current.value;

            const formattedVerb = instr.type ? `${formatType(instr.type)}` : '<unknown>';
            const matchable = instr.value;
            const formattedMode = matchable
              ? ` ${formatType(isString(matchable) ? matchable : matchable.type)}`
              : '';
            const descriptor = matchable?.value;
            const formattedDescriptor = descriptor
              ? ` ${
                  descriptor.source && descriptor.flags
                    ? descriptor.toString()
                    : formatType(isString(descriptor) ? descriptor : descriptor?.type)
                }`
              : '';

            console.log(i`${formattedVerb}${formattedMode}${formattedDescriptor}`);

            const eats = instr.type === sym.eat || instr.type === sym.eatMatch;

            const result = yield instr;

            anyResult = anyResult || (eats && result);

            current = generator.next(result);
          }
          normalCompletion = anyResult;
        } finally {
          if (tokenizerTransition) {
            productionTypes.set(context, sym.node);
          }

          if (normalCompletion) {
            console.log(i`${tokenizerTransition ? '<<<' : '<--'} ${formatType(type)}`);
          } else {
            // TODO: distinguish error/final termination
            // In an error termination we don't want to make it look like we kept running the grammar
            console.log(i`${tokenizerTransition ? 'xxx' : 'x--'} ${formatType(type)}`);
          }
        }
      },
    };
  }, grammar);
};
