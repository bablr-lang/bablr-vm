import { Coroutine } from '@bablr/coroutine';
import {
  buildCall,
  buildReferenceTag,
  buildNullTag,
  buildEmbeddedTag,
  buildArrayTag,
} from '@bablr/agast-helpers/builders';
import { StreamGenerator } from '@bablr/agast-helpers/stream';
import { formatType } from './utils/format.js';
import { facades } from '../../bablr-vm-strategy-parse/lib/facades.js';
import { State } from './state.js';
import { updateSpans } from './spans.js';
import {
  DoctypeTag,
  OpenNodeTag,
  CloseNodeTag,
  ReferenceTag,
  ShiftTag,
  GapTag,
  NullTag,
  LiteralTag,
} from '@bablr/agast-helpers/symbols';
import { NodeFacade } from './node.js';
import { treeFromStreamSync } from '@bablr/agast-helpers/tree';

const getSourceLength = (tags) => {
  let i = 0;
  for (const tag of tags) {
    if (tag.type === LiteralTag) {
      i += tag.value.length;
    } else if (tag.type === GapTag) {
      i += 1;
    }
  }
  return i;
};

const { hasOwn } = Object;

export const createBablrStrategy = (ctx, rootSource, strategy) => {
  return (agastCtx, agastState) => {
    if (agastCtx !== ctx.agast.facade) throw new Error();
    return new StreamGenerator(__strategy(ctx, rootSource, agastState, strategy));
  };
};

const resolvedLanguages = new WeakMap();

const __strategy = function* bablrStrategy(ctx, rootSource, agastState, strategy) {
  let s = State.from(rootSource, agastState, ctx);

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

    const instr = co.value;
    let returnValue = undefined;

    const { verb } = instr;

    switch (verb) {
      case 'advance': {
        const { arguments: { 0: embeddedTag } = [] } = instr;

        const tag = embeddedTag.value;

        switch (tag?.type || NullTag) {
          case DoctypeTag: {
            const doctypeTag = yield instr;

            returnValue = doctypeTag;
            break;
          }

          case OpenNodeTag: {
            const { type } = tag.value;

            const openTag = yield instr;

            if (type) {
              updateSpans(ctx, s, s.node, 'open');
            }

            returnValue = openTag;
            break;
          }

          case CloseNodeTag: {
            const { node } = s;

            if (node.flags.escape) {
              const cooked = node.flags.hasGap
                ? null
                : ctx.languages
                    .get(node.language)
                    .getCooked?.(NodeFacade.wrap(node, ctx, true), s.span.name, facades.get(ctx)) ||
                  null;

              yield buildCall('bindAttribute', 'cooked', cooked);
            }

            const closeTag = yield instr;

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

            returnValue = closeTag;
            break;
          }

          case LiteralTag: {
            const { value: pattern } = tag;

            let result = s.guardedMatch(pattern);

            if (result instanceof Promise) {
              result = yield result;
            }

            if (result) {
              let sourceStep = s.source.advance(getSourceLength(result));

              if (sourceStep instanceof Promise) {
                sourceStep = yield sourceStep;
              }

              returnValue = yield instr;
            } else {
              throw new Error('Failed to advance literal');
            }
            break;
          }

          case GapTag: {
            if (s.source.value == null && !s.source.done) {
              if (s.source.holding) {
                s.source.unshift();
              } else {
                const sourceStep = s.source.advance(1);

                if (sourceStep instanceof Promise) {
                  yield sourceStep;
                }
              }

              returnValue = yield instr;
            } else {
              throw new Error('Failed to advance gap');
            }
            break;
          }

          case ShiftTag: {
            s.source.shift();

            returnValue = yield instr;
            break;
          }

          default: {
            returnValue = yield instr;
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

        returnValue = result && NodeFacade.wrap(treeFromStreamSync(result), ctx, true);
        break;
      }

      case 'branch': {
        const baseState = s;
        let { source, agast, context, balanced, spans, node } = baseState;

        agast = yield instr;

        s = s.push(source.branch(), agast, context, balanced, spans);

        if (node) {
          resolvedLanguages.set(s.node, resolvedLanguages.get(node));
        }

        returnValue = facades.get(s);
        break;
      }

      case 'accept': {
        const accepted = s;

        s.status = 'accepted';

        const agastState = yield instr;

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

        yield instr;

        s = s.parent;

        if (s.path.depth && rejectedState.path.depth >= s.path.depth) {
          // const didShift = rejectedState.node.at(sNodeDepth) === s.node;
          const didShift =
            s.nodeForPath(s.path) && !s.nodeForPath(rejectedState.path.at(s.path.depth));
          const lowPath = rejectedState.path.at(
            Math.min(
              s.path.depth + (didShift || s.result.type === ReferenceTag ? 0 : 1),
              rejectedState.path.depth,
            ),
          );
          const lowNode = s.node || s.parentNode;

          const { name, isArray, hasGap } = lowPath.reference?.value || {};

          if (
            !didShift &&
            !hasOwn(lowNode.properties, name) &&
            !(s.result.type === ReferenceTag && s.result.value.name === name)
          ) {
            if (isArray) {
              yield buildCall('advance', buildEmbeddedTag(buildReferenceTag(name, true, hasGap)));
              yield buildCall('advance', buildEmbeddedTag(buildArrayTag()));
            } else {
              yield buildCall(
                'advance',
                buildEmbeddedTag(buildReferenceTag(name, isArray, hasGap)),
              );
              yield buildCall('advance', buildEmbeddedTag(buildNullTag()));
            }
          }
        }

        if (!s) throw new Error('rejected root state');

        rejectedState.source.reject();

        returnValue = facades.get(s);
        break;
      }

      case 'openSpan': {
        let { arguments: { 0: name } = [] } = instr;
        s.spans = s.spans.push({ guard: null, name, path: s.path, type: 'Instruction' });
        break;
      }

      case 'closeSpan': {
        if (s.spans.value.type !== 'Instruction') throw new Error();
        s.spans = s.spans.pop();
        break;
      }

      case 'write':
      case 'bindAttribute': {
        returnValue = yield instr;
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
