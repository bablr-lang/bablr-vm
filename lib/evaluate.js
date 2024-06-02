import { Coroutine } from '@bablr/coroutine';
import { buildCall, buildNull, buildReference, reifyExpression } from '@bablr/agast-vm-helpers';
import { StreamGenerator } from '@bablr/agast-helpers/stream';
import { resolveLanguage } from '@bablr/helpers/grammar';
import { buildTokens } from './utils/token.js';
import { formatType } from './utils/format.js';
import { facades } from './facades.js';
import { State } from './state.js';
import { updateSpans } from './spans.js';

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

    const sourceStep = s.source.fork.head.step;

    if (sourceStep instanceof Promise) {
      yield sourceStep;
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

            returnValue = doctypeTag;
            break;
          }

          case 'OpenNodeTag': {
            const { flags, type, language: tagLanguage, intrinsicValue } = terminal.value;

            const reference = s.result;

            if (
              s.path.depth > 1 &&
              !flags.trivia &&
              !flags.escape &&
              reference?.type !== 'Reference' &&
              reference?.type !== 'OpenFragmentTag'
            ) {
              throw new Error('Invalid location for OpenNodeTag');
            }

            const oldNode = s.node;

            const openTag = yield sourceInstr;

            const resolvedLanguage =
              oldNode.depth > 1 ? resolvedLanguages.get(oldNode) : rootLanguage;
            const nextResolvedLanguage = resolveLanguage(resolvedLanguage, tagLanguage);

            if (!nextResolvedLanguage) {
              throw new Error(`Resolve failed { language: ${tagLanguage} }`);
            }

            const grammar = ctx.grammars.get(nextResolvedLanguage);
            const isNode = grammar.covers.get(nodeTopType).has(type);

            let intrinsicResult = intrinsicValue && s.guardedMatch(terminal.value);

            if (intrinsicResult instanceof Promise) {
              intrinsicResult = yield intrinsicResult;
            }

            updateSpans(ctx, s, intrinsicValue ? ctx.agast.nodeForTag(openTag) : s.node, 'open');

            if (intrinsicValue) {
              if (!intrinsicResult) {
                throw new Error('advance failed to match an intrinsic node');
              }

              const sourceStep = s.source.advance(intrinsicResult.length);

              if (sourceStep instanceof Promise) {
                yield sourceStep;
              }

              updateSpans(ctx, s, ctx.agast.nodeForTag(openTag), 'close');
            } else {
              if (isNode) {
                resolvedLanguages.set(s.node, nextResolvedLanguage);
              } else {
                resolvedLanguages.set(s.node, resolvedLanguage);
              }
            }

            returnValue = openTag;
            break;
          }

          case 'OpenFragmentTag': {
            const openTag = yield sourceInstr;

            resolvedLanguages.set(s.node, rootLanguage);

            returnValue = openTag;
            break;
          }

          case 'CloseNodeTag': {
            const { node } = s;

            const endTag = yield sourceInstr;

            if (s.path) {
              updateSpans(ctx, s, node, 'close');
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

            let result = s.guardedMatch(pattern);

            if (result instanceof Promise) {
              result = yield result;
            }

            if (result) {
              let sourceStep = s.source.advance(result.length);

              if (sourceStep instanceof Promise) {
                sourceStep = yield sourceStep;
              }

              returnValue = yield sourceInstr;
            } else {
              throw new Error('Failed to advance literal');
            }
            break;
          }

          case 'Gap': {
            if (s.source.value == null && !s.source.done) {
              const sourceStep = s.source.advance(1);

              if (sourceStep instanceof Promise) {
                yield sourceStep;
              }

              returnValue = yield sourceInstr;
            } else {
              throw new Error('Failed to advance gap');
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
        let { arguments: { 0: pattern } = [] } = instr;

        let result = s.guardedMatch(pattern);

        if (result instanceof Promise) {
          result = yield result;
        }

        returnValue = result && ctx.agast.buildRange(buildTokens(result));
        break;
      }

      case 'shift': {
        s.source.shift();

        yield sourceInstr;

        break;
      }

      case 'unshift': {
        s.source.unshift();

        yield sourceInstr;

        break;
      }

      case 'branch': {
        const baseState = s;
        let { context, source, agast, balanced, spans, node } = baseState;

        agast = yield sourceInstr;

        s = s.push(context, source.branch(), agast, balanced, spans);

        resolvedLanguages.set(s.node, resolvedLanguages.get(node));

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

        if (rejectedState.path.depth > s.path.depth) {
          const lowPath = rejectedState.path.at(
            Math.min(s.path.depth + 1, rejectedState.path.depth),
          );

          if (s.path.depth) {
            const { name, isArray } = lowPath.reference?.value || {};

            if (s.node.depth === s.path.depth && !s.node.resolver.counters.has(name)) {
              if (!lowPath.openTag?.value.flags.trivia && !lowPath.openTag?.value.flags.escape) {
                yield buildCall('advance', buildReference(name, isArray));
              }

              if (s.result.type === 'Reference') {
                yield buildCall('advance', buildNull());
              }
            }
          }
        }

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
