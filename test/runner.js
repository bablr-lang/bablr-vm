import { print, traverse } from 'cst-tokens';
import { parseModule as parse } from 'meriyah';
import { Grammar } from '@cst-tokens/helpers/grammar';
import * as sym from '@cst-tokens/helpers/symbols';

import js from './languages/js-lite/index.js';

Error.stackTraceLimit = 20;

const isString = (val) => typeof val === 'string';

const formatType = (type) => {
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

const sourceText = `import {spec} from 'source'`;

// console.log(JSON.stringify(parse(sourceText), undefined, 2));

function* concat(...iterables) {
  for (const iterable of iterables) if (iterable) yield* iterable;
}

const indents = new WeakMap();
const productionTypes = new WeakMap();

// Polyglot syntax/node metaproduction
const WithLogging = ([type, production]) => {
  const name = `WithLogging_${production.name}`;

  return [
    type,
    {
      *[name](props, grammar, next) {
        const { getState, context } = props;
        const { productionType } = getState();

        if (!productionTypes.has(context)) {
          productionTypes.set(context, sym.node);
        }

        if (!indents.has(context)) {
          indents.set(context, 0);
        }

        const baseIndentDepth = productionType === sym.token ? indents.get(context) : 0;

        const i = (strings, ...args) => {
          const indentation = ' '.repeat((1 + baseIndentDepth + getState().depth) * 2);
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
          const generator = production(props, grammar, next);
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

            const isTokenizerTransition =
              productionType === sym.node && matchable?.type === sym.token;

            if (isTokenizerTransition) {
              indents.set(context, getState().depth);
            }

            const result = yield instr;

            anyResult = anyResult || (eats && result);

            if (isTokenizerTransition) {
              indents.set(context, getState().depth);
            }

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
    }[name],
  ];
};

const buildGrammar = (grammar, enhancers) => {
  return new Grammar({
    ...grammar,
    enhancers: concat(enhancers, grammar.enhancers),
  });
};

const buildLanguage = (language, enhancers) => {
  const { grammars } = language;
  return {
    ...language,
    grammars: {
      ...grammars,
      node: buildGrammar(grammars.node, enhancers),
      token: buildGrammar(grammars.token, enhancers),
    },
  };
};

console.log('');

try {
  traverse(buildLanguage(js, [WithLogging]), parse(sourceText), sourceText);
} catch (e) {
  console.log('');
  console.error(e);
}

// console.log(JSON.stringify(cst, undefined, 2));

// const printed = print(cst);

// if (printed !== sourceText) {
//   let m;
//   m = `source text could not be reconstructed from CST
//   Source: \`${`${sourceText.replace(/\n/g, '\\n')}`}\`
//   Printed: \`${`${printed.replace(/\n/g, '\\n')}`}\``;
//   throw new Error(m);
// }
