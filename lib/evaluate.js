import { Coroutine } from '@bablr/coroutine';
import { reifyExpression, buildString } from '@bablr/agast-vm-helpers';
import { StreamGenerator } from '@bablr/agast-helpers/stream';
import { resolveLanguage } from '@bablr/helpers/grammar';
import { formatType } from './utils/format.js';
import { match } from './utils/pattern.js';
import { facades } from './facades.js';
import { State } from './state.js';

const nodeTopType = Symbol.for('@bablr/node');

export const evaluate = (ctx, rootLanguage, rootSource, strategy) => {
  return (agastCtx, agastState) => {
    if (ctx.agast !== agastCtx) throw new Error();

    if (rootLanguage !== ctx.languages.get(rootLanguage.canonicalURL)) {
      throw new Error();
    }

    return new StreamGenerator(__evaluate(ctx, rootLanguage, rootSource, agastState, strategy));
  };
};

const resolvedLanguages = new WeakMap();

const __evaluate = function* bablrStrategy(ctx, rootLanguage, rootSource, agastState, strategy) {
  let s = State.from(ctx, rootSource, agastState);

  let co = new Coroutine(strategy(facades.get(s), facades.get(ctx)));

  co.advance();

  {
    s.source.advance();

    const maybePromise = s.source.fork.head.step;

    if (maybePromise instanceof Promise) {
      yield maybePromise;
    }
  }

  for (;;) {
    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }

    if (co.done) break;

    const sourceInstr = co.value;
    const instr = reifyExpression(sourceInstr);
    let returnValue = undefined;

    const { verb } = instr;

    switch (verb) {
      case 'advance': {
        const {
          arguments: { 0: terminal = [] },
        } = instr;

        switch (terminal?.type || 'Null') {
          case 'DoctypeTag': {
            const doctypeTag = yield sourceInstr;

            resolvedLanguages.set(s.path, rootLanguage);

            returnValue = doctypeTag;
            break;
          }

          case 'OpenNodeTag': {
            const { flags, type, language: tagLanguage, attributes } = terminal.value;
            const { innerSpan, balanced, balancer } = attributes || {};

            const reference = s.result;

            if (
              !flags.trivia &&
              !flags.escape &&
              reference?.type !== 'Reference' &&
              reference?.type !== 'OpenFragmentTag'
            ) {
              throw new Error();
            }

            const oldPath = s.path;

            const openTag = yield sourceInstr;

            const resolvedLanguage = resolvedLanguages.get(oldPath.parent);
            const nextResolvedLanguage = resolveLanguage(resolvedLanguage, tagLanguage);

            if (!nextResolvedLanguage) {
              throw new Error(`Resolve failed { language: ${tagLanguage} }`);
            }

            const grammar = ctx.grammars.get(nextResolvedLanguage);
            const isNode = grammar.covers.get(nodeTopType).has(type);
            if (isNode) {
              resolvedLanguages.set(s.path, nextResolvedLanguage);
            } else {
              resolvedLanguages.set(s.path, resolvedLanguage);
            }

            const sourceAttributes =
              sourceInstr.properties.arguments.properties.values[0].properties.attributes;

            // for (const attribute of sourceAttributes) {
            //   yield buildCall(
            //     'bindAttribute',
            //     attribute.properties.key,
            //     attribute.properties.value,
            //   );
            // }

            if (balancer) {
              const balancedPath = s.balanced.value;

              if (!s.balanced.size) throw new Error();

              s.balanced = s.balanced.pop();

              if (balancer && balancedPath.startTag.value.attributes.lexicalSpan) {
                s.spans = s.spans.pop();
              }
            }

            if (balanced) {
              s.balanced = s.balanced.push(s.path);
            }

            if (innerSpan) {
              s.spans = s.spans.push({
                type: 'Inner',
                name: innerSpan,
                path: s.path,
              });
            }

            returnValue = openTag;
            break;
          }

          case 'OpenFragmentTag': {
            const openTag = yield sourceInstr;

            returnValue = openTag;
            break;
          }

          case 'CloseNodeTag': {
            const { startTag } = s.path;
            const { attributes } = startTag.value;
            const { lexicalSpan, innerSpan, balanced } = attributes || {};

            const endTag = yield sourceInstr;

            if (s.path) {
              if (lexicalSpan) {
                if (!balanced) throw new Error();

                s.spans = s.spans.push({
                  type: 'Lexical',
                  name: lexicalSpan,
                  path: s.path,
                  guard: balanced,
                });
              }

              if (innerSpan) {
                s.spans = s.spans.pop();
              }
            }

            returnValue = endTag;
            break;
          }

          case 'CloseFragmentTag': {
            returnValue = yield sourceInstr;

            if (!s.path) {
              if (!s.source.done) {
                throw new Error('Parser failed to consume input');
              }

              if (s.balanced.size) {
                throw new Error('Parser did not match all balanced nodes');
              }
            }
            break;
          }

          case 'Literal': {
            const { value: pattern } = terminal;

            const result = match(pattern, s.guardedSource);

            if (result) {
              const maybePromise = s.source.advance(result.length);

              if (maybePromise instanceof Promise) {
                yield maybePromise;
              }

              returnValue = yield sourceInstr;
            } else {
              returnValue = null;
            }
            break;
          }

          case 'Gap': {
            if (s.source.value == null && !s.source.done) {
              const maybePromise = s.source.advance(1);

              if (maybePromise instanceof Promise) {
                yield maybePromise;
              }

              returnValue = yield sourceInstr;
            } else {
              returnValue = null;
            }
            break;
          }

          default: {
            returnValue = yield sourceInstr;
            break;
          }
        }

        break;
      }

      case 'match': {
        const { arguments: { 0: pattern } = [] } = instr;

        let result = match(pattern, s.guardedSource);

        if (result instanceof Promise) {
          result = yield result;
        }

        returnValue = result && buildString(result);
        break;
      }

      case 'branch': {
        let { context, source, agast, balanced, spans } = s;

        const baseState = s;

        agast = yield sourceInstr;

        s = s.push(context, source.branch(), agast, balanced, spans);

        resolvedLanguages.set(s.path, resolvedLanguages.get(baseState.path));

        returnValue = facades.get(s);
        break;
      }

      case 'accept': {
        const accepted = s;

        const agastState = yield sourceInstr;

        s = s.parent;

        if (!s) {
          throw new Error('accepted the root state');
        }

        s.spans = accepted.spans;
        s.balanced = accepted.balanced;

        s.source.accept(accepted.source);
        s.agast = agastState;

        returnValue = facades.get(s);
        break;
      }

      case 'reject': {
        const rejectedState = s;

        yield sourceInstr;

        s = s.parent;

        if (!s) throw new Error('rejected root state');

        rejectedState.source.reject();

        returnValue = facades.get(s);
        break;
      }

      case 'bindAttribute': {
        returnValue = yield sourceInstr;
        break;
      }

      case 'getState': {
        returnValue = facades.get(s);
        break;
      }

      case 'getContext': {
        returnValue = facades.get(ctx);
        break;
      }

      default: {
        throw new Error(`Unexpected call of {type: ${formatType(verb)}}`);
      }
    }

    co.advance(returnValue);
  }
};
