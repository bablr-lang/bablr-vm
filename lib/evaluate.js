import startsWithSeq from 'iter-tools-es/methods/starts-with-seq';
import { Coroutine } from '@bablr/coroutine';
import { reifyExpression, buildCall } from '@bablr/agast-vm-helpers';
import { formatType } from './utils/format.js';
import { match } from './utils/pattern.js';
import { facades } from './facades.js';
import { State } from './state.js';

export const evaluate = (ctx, rootSource, strategy) => (agastCtx, agastState) => {
  if (ctx.agast !== agastCtx) throw new Error();

  return __evaluate(ctx, rootSource, agastState, strategy);
};

function* __evaluate(ctx, rootSource, agastState, strategy) {
  let s = State.from(ctx, rootSource, agastState);

  let co = new Coroutine(strategy(facades.get(s), facades.get(ctx)));

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
            const { innerSpan, balanced, balancer } = attributes || {};

            const reference = s.result;

            if (
              !flags.trivia &&
              reference?.type !== 'Reference' &&
              reference?.type !== 'OpenFragmentTag'
            )
              throw new Error();

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
              s.source.advance(result.length);
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

        returnValue = match(pattern, s.guardedSource);
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
