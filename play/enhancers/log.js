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
    : `\`${type.replace(/[`\\]/g, '\\$&')}\``;
};

export const formatValue = (value) => {
  if (isString(value)) {
    return `\`${value.replace(/[`\\]/g, '\\$&')}\``;
  } else {
    return String(value);
  }
};

const formatProduction = (type, p) => {
  switch (type) {
    case sym.node:
      return formatType(p.type);

    case sym.character:
      return formatValue(p);

    case sym.token:
      const formattedValue = isString(p.value) ? `:${formatValue(p.value).slice(1, -1)}` : '';
      return `\`${formatType(p.type).slice(1, -1)}${formattedValue}\``;
  }
};

const formatGrammarType = (type) => {
  // prettier-ignore
  switch (type) {
      case sym.node: return 'node';
      case sym.token: return 'tok';
      case sym.character: return 'chr';
      default: return '?';
    }
};

const formatMatchable = (matchable) => {
  return `${formatGrammarType(matchable.type)}${formatProduction(
    matchable.type,
    matchable.production,
  )}`;
};

const formatEffect = (effect) => {
  // prettier-ignore
  switch (effect) {
    case sym.eat: return 'E';
    case sym.fail: return 'F';
    case sym.none: return ' '
    default: return '?';
  }
};

const formatMatch = (instruction) => {
  const { matchable, effects } = instruction;

  const formattedEffects = `${formatEffect(effects.success)} ${formatEffect(effects.failure)}`;

  return `${formattedEffects} ${formatMatchable(matchable)}`;
};

const formatDisambiguate = (cases) => {
  return cases.map(([matchable]) => formatMatchable(matchable)).join(' ');
};

const formatInstr = (instr) => {
  const formattedVerb = instr.type ? `${formatType(instr.type)}` : '<unknown>';

  let formattedValue = '';

  if (instr.type === sym.match) {
    formattedValue = ` ${formatMatch(instr.value)}`;
  } else if (instr.type === sym.disambiguate) {
    formattedValue = ` ${formatDisambiguate(instr.value)}`;
  }

  return `${formattedVerb}${formattedValue}`;
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

        const tokenizerTransition = productionTypes.get(context) !== productionType;

        if (tokenizerTransition) {
          productionTypes.set(context, sym.token);
        }

        const i = (strings, ...args) => {
          const indentation = ' '.repeat((1 + state.depth) * 2);
          const content = String.raw(strings, ...args);
          return `${indentation}${content}`;
        };

        console.log(i`${tokenizerTransition ? '>>>' : '-->'} ${formatType(type)}`);

        try {
          const generator = production.value(props, grammar, next);
          let current = generator.next();

          let anyResult = false;

          while (!current.done) {
            const instr = current.value;

            console.log(i`${formatInstr(instr)}`);

            const eats = instr.type === sym.match && instr.value.effects.success === sym.eat;

            const result = yield instr;

            anyResult = anyResult || (eats && result);

            current = generator.next(result);
          }

          if (anyResult) {
            console.log(i`${tokenizerTransition ? '<<<' : '<--'} ${formatType(type)}`);
          } else {
            console.log(i`${tokenizerTransition ? 'xxx' : 'x--'} ${formatType(type)}`);
          }
        } catch (e) {
          if (e === 'failure') {
            console.log(i`${tokenizerTransition ? 'xxx' : 'x--'} ${formatType(type)}`);
          }
          throw e;
        } finally {
          if (tokenizerTransition) {
            productionTypes.set(context, sym.node);
          }
        }
      },
    };
  }, grammar);
};
