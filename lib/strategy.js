import { Coroutine } from '@bablr/coroutine';
import { buildCall, buildNull, buildReference, reifyExpression } from '@bablr/agast-vm-helpers';
import { StreamGenerator } from '@bablr/agast-helpers/stream';
import { buildTokens } from './utils/token.js';
import { formatType } from './utils/format.js';
import { facades } from './facades.js';
import { State } from './state.js';
import { updateSpans } from './spans.js';

export const createBablrStrategy = (rootSource, strategy) => {
  return (ctx, agastState) => {
    return new StreamGenerator(__strategy(ctx, rootSource, agastState, strategy));
  };
};

const resolvedLanguages = new WeakMap();

const __strategy = function* bablrStrategy(ctx, rootSource, agastState, strategy) {
  let s = State.from(rootSource, agastState);

  let co = new Coroutine(strategy(facades.get(s), ctx));

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
            const { type, intrinsicValue } = terminal.value;

            const openTag = yield sourceInstr;

            if (type) {
              let intrinsicResult = intrinsicValue && s.guardedMatch(terminal.value);

              if (intrinsicResult instanceof Promise) {
                intrinsicResult = yield intrinsicResult;
              }

              updateSpans(ctx, s, ctx.nodeForTag(openTag), 'open');

              if (intrinsicValue) {
                if (!intrinsicResult) {
                  throw new Error('advance failed to match an intrinsic node');
                }

                const sourceStep = s.source.advance(intrinsicResult.length);

                if (sourceStep instanceof Promise) {
                  yield sourceStep;
                }

                updateSpans(ctx, s, ctx.nodeForTag(openTag), 'close');
              }
            }

            returnValue = openTag;
            break;
          }

          case 'CloseNodeTag': {
            const { node } = s;

            const endTag = yield sourceInstr;

            if (s.path) {
              updateSpans(ctx, s, node, 'close');
            } else {
              if (!s.source.done) {
                throw new Error('Parser failed to consume input');
              }

              if (s.balanced.size) {
                throw new Error('Parser did not match all balanced nodes');
              }
            }

            returnValue = endTag;
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
              if (s.source.holding) {
                s.source.unshift();
              } else {
                const sourceStep = s.source.advance(1);

                if (sourceStep instanceof Promise) {
                  yield sourceStep;
                }
              }

              returnValue = yield sourceInstr;
            } else {
              throw new Error('Failed to advance gap');
            }
            break;
          }

          case 'Shift': {
            s.source.shift();

            returnValue = yield sourceInstr;
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

        returnValue = result && ctx.buildRange(buildTokens(result));
        break;
      }

      case 'branch': {
        const baseState = s;
        let { source, agast, balanced, spans, node } = baseState;

        agast = yield sourceInstr;

        s = s.push(source.branch(), agast, balanced, spans);

        if (node) {
          resolvedLanguages.set(s.node, resolvedLanguages.get(node));
        }

        returnValue = facades.get(s);
        break;
      }

      case 'accept': {
        const accepted = s;

        s.status = 'accepted';

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

        s.status = 'rejected';

        yield sourceInstr;

        s = s.parent;

        if (s.path.depth && rejectedState.path.depth > s.path.depth) {
          // const didShift = rejectedState.node.at(sNodeDepth) === s.node;
          const didShift =
            ctx.nodeForPath(s.path) && !ctx.nodeForPath(rejectedState.path.at(s.path.depth));
          const lowPath = rejectedState.path.at(
            Math.min(s.path.depth + (didShift ? 0 : 1), rejectedState.path.depth),
          );
          const lowNode = s.node || s.parentNode;

          const { name, isArray } = lowPath.reference?.value || {};

          if (!didShift && !lowNode.resolver.counters.has(name)) {
            if (!lowNode.openTag?.value.flags.trivia && !lowNode.openTag?.value.flags.escape) {
              yield buildCall('advance', buildReference(name, isArray));
            }

            yield buildCall('advance', buildNull());
          }
        }

        if (!s) throw new Error('rejected root state');

        rejectedState.source.reject();

        returnValue = facades.get(s);
        break;
      }

      case 'write':
      case 'bindAttribute': {
        returnValue = yield sourceInstr;
        break;
      }

      case 'getState': {
        returnValue = facades.get(s);
        break;
      }

      default: {
        throw new Error(`Unexpected call of {type: ${formatType(verb)}}`);
      }
    }

    co.advance(returnValue);
  }
};
