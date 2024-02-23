import startsWithSeq from 'iter-tools-es/methods/starts-with-seq';
import { exec } from '@bablr/regex-vm';
import { evaluate as agastEvaluate } from '@bablr/agast-vm';
import { Coroutine } from '@bablr/coroutine';
import { buildCall, reifyExpression, runSync, runAsync } from '@bablr/agast-vm-helpers';
import { formatType } from './utils/format.js';
import { assertValidRegex } from './utils/token.js';
import { actuals, facades } from './facades.js';
import { State } from './state.js';

export function evaluate(ctxFacade, rootSourceFacade, strategy) {
  const ctx = actuals.get(ctxFacade);
  const rootSource = actuals.get(rootSourceFacade);

  if (ctxFacade && !ctx) throw new Error();
  if (rootSourceFacade && !rootSource) throw new Error();

  return agastEvaluate(__evaluate(ctx, rootSource, strategy));
}

function* __evaluate(ctx, rootSource, strategy) {
  let s = State.from(ctx, rootSource);

  let co = new Coroutine(strategy(s, ctx));

  co.advance();

  while (!co.done) {
    const instr = co.value;
    let returnValue = undefined;

    const {
      verb: verbToken,
      arguments: {
        properties: { values: { 0: matcher } = [] },
      },
    } = instr.properties;
    const verb = reifyExpression(verbToken);

    switch (verb) {
      case 'advance': {
        yield buildCall();

        break;
      }

      case 'match': {
        switch (matcher.type) {
          case 'String':
          case 'Pattern': {
            const { source } = s;

            let result = null;

            switch (matcher.type) {
              case 'Pattern': {
                assertValidRegex(matcher);

                [result] = exec(matcher, source);
                break;
              }

              case 'String': {
                const pattern = reifyExpression(matcher);
                if (startsWithSeq(pattern, source)) {
                  result = pattern;
                }
                break;
              }
            }

            returnValue = result;
            break;
          }

          default:
            throw new Error(`Unknown matcher of {type: ${matcher.type}}`);
        }

        break;
      }

      case 'branch': {
        const { context, source, agast, balanced, spans } = s;

        yield instr;

        s = s.push(new State(context, source.branch(), agast.branch(), balanced, spans));

        returnValue = facades.get(s);
        break;
      }

      case 'accept': {
        const accepted = s;

        yield instr;

        s = s.parent;

        if (!s) {
          throw new Error('accepted the root state');
        }

        s.spans = accepted.spans;
        s.balanced = accepted.balanced;

        s.source.accept(accepted.source);
        s.agast.accept(accepted.agast);

        returnValue = facades.get(s);
        break;
      }

      case 'reject': {
        const rejectedState = s;

        yield instr;

        ctx.nextTerminals.delete(s.result);

        s = s.parent;

        if (!s) throw new Error('rejected root state');

        rejectedState.source.reject();

        returnValue = facades.get(s);
        break;
      }

      case 'startNode': {
        const {
          arguments: {
            properties: { values: { 0: flags, 1: type, 2: attributes } = [] },
          },
        } = instr.properties;

        const openTag = yield buildCall('startNode', flags, type, attributes);

        const reference = s.result;
        const isFragment = type != null;

        if (!isFragment && reference?.type !== 'Reference') throw new Error();

        if (!isFragment) {
          const { spanInside, balanced } = s.path;
          const { balancer } = openTag.value?.attributes || {};

          if (balancer) {
            const balancedPath = s.balanced.value;

            if (!s.balanced.size) throw new Error();

            s.balanced = s.balanced.pop();

            if (balancer && balancedPath.spanBetween) {
              s.spans = s.spans.pop();
            }
          }

          if (balanced) {
            s.balanced = s.balanced.push(s.path);
          }

          if (spanInside) {
            s.spans = s.spans.push({
              type: 'Inner',
              name: spanInside,
              path: s.path,
            });
          }
        }

        returnValue = openTag;
        break;
      }

      case 'endNode': {
        const {
          arguments: {
            properties: { values: { 0: type } = [] },
          },
        } = instr.properties;

        const endTag = yield buildCall('endNode', type);

        const type_ = reifyExpression(type);
        const isFragment = type_ == null;

        if (!isFragment) {
          const { balanced, spanInside, spanBetween } = s.path;

          if (spanBetween) {
            if (!balanced) throw new Error();

            s.spans = s.spans.push({
              type: 'Lexical',
              name: spanBetween,
              path: s.path,
            });
          }

          if (spanInside) {
            s.spans = s.spans.pop();
          }
        }

        returnValue = endTag;
        break;
      }

      case 'resolve': {
        returnValue = yield instr;
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
}

export const evaluateSync = (...args) => runSync(evaluate(...args));
export const evaluateAsync = (...args) => runAsync(evaluate(...args));
