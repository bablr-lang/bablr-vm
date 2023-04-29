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

export const formatValue = (value) => {
  if (isString(value)) {
    return `'${value.replace(/['\\]/g, '\\$&')}'`;
  } else {
    return String(value);
  }
};

const formatProduction = (type, p) => {
  switch (type) {
    case sym.node:
      return ` ${formatType(p.type)}`;

    case sym.character:
      return ` ${formatValue(p)}`;

    case sym.token:
      const formattedValue = isString(p.value) ? ` ${formatValue(p.value)}` : '';
      return ` ${formatType(p.type)}${formattedValue}`;

    case sym.boundary:
      return p ? ` ${formatType(p.type)}` : '';
  }
};

const formatGrammarType = (type) => {
  // prettier-ignore
  switch (type) {
      case sym.node: return 'node';
      case sym.token: return 'tokn';
      case sym.character: return 'char';
      case sym.boundary: return 'boun';
      default: return '?';
    }
};

const formatMatchable = (matchable) => {
  return `${formatGrammarType(matchable.type)}${formatProduction(matchable.type, matchable.value)}`;
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
  const { matchable, successEffect, failureEffect } = instruction;

  const formattedEffects = `${formatEffect(successEffect)} ${formatEffect(failureEffect)}`;

  return `${formattedEffects} ${formatMatchable(matchable)}`;
};

const formatInstr = (instr) => {
  const formattedVerb = instr.type ? `${formatType(instr.type)}` : '<unknown>';

  let formattedValue = '';

  if (instr.type === sym.match) {
    formattedValue = ` ${formatMatch(instr.value)}`;
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

        let normalCompletion = false;
        try {
          const generator = production.match(props, grammar, next);
          let current = generator.next();

          let anyResult = false;

          while (!current.done) {
            const instr = current.value;

            console.log(i`${formatInstr(instr)}`);

            const eats = instr.type === sym.match && instr.value.successEffect === sym.eat;

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
