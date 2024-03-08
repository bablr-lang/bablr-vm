import startsWithSeq from 'iter-tools-es/methods/starts-with-seq';
import isString from 'iter-tools-es/methods/is-string';
import { exec } from '@bablr/regex-vm';
import { Coroutine } from '@bablr/coroutine';
import { reifyExpression, buildCall } from '@bablr/agast-vm-helpers';
import { formatType } from './utils/format.js';
import { assertValidRegex } from './utils/token.js';
import { facades } from './facades.js';
import { State } from './state.js';

export const evaluate = (ctx, rootSource, strategy) => (agastCtx, agastState) => {
  if (ctx.agast !== agastCtx) throw new Error();

  return __evaluate(ctx, rootSource, agastState, strategy);
};

function* __evaluate(ctx, rootSource, agastState, strategy) {
  let s = State.from(ctx, rootSource, agastState);

  let co = new Coroutine(strategy(s, facades.get(ctx)));

  co.advance();

  while (!co.done) {
    const sourceInstr = co.value;
    const instr = reifyExpression(sourceInstr);
    let returnValue = undefined;

    const { verb } = instr;

    switch (verb) {
      case 'advance': {
        const {
          arguments: { 0: terminal = [] },
        } = instr;

        switch (terminal.type) {
          case 'OpenNodeTag': {
            const { flags, attributes } = terminal.value;
            const { lexicalSpan: spanInside, balanced, balancer } = attributes || {};

            const reference = s.result;

            if (reference?.type !== 'Reference') throw new Error();

            const openTag = yield sourceInstr;

            for (const attribute of sourceInstr.properties.arguments.properties.values[0].properties
              .attributes) {
              yield buildCall(
                'bindAttribute',
                attribute.properties.key,
                attribute.properties.value,
              );
            }

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

            returnValue = openTag;
            break;
          }

          case 'CloseNodeTag': {
            const { type } = terminal;

            const endTag = yield sourceInstr;
            const isFragment = type == null;

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
            const { value } = terminal;
            const { source } = s;

            if (startsWithSeq(value, source)) {
              returnValue = yield sourceInstr;
              source.advance(value.length);
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
        const { arguments: { 0: matcher } = [] } = instr;
        const { source } = s;

        let result;

        if (isString(matcher)) {
          const pattern = matcher;
          if (startsWithSeq(pattern, source)) {
            result = pattern;
          }
        } else if (matcher.type === 'Pattern') {
          assertValidRegex(matcher);

          [result = null] = exec(matcher, source);
        } else {
          throw new Error();
        }

        returnValue = result;
        break;
      }

      case 'branch': {
        let { context, source, agast, balanced, spans } = s;

        agast = yield sourceInstr;

        s = s.push(context, source.branch(), agast, balanced, spans);

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

      case 'resolve': {
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
}
