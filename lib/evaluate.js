/* global WeakSet */
import { Coroutine } from '@bablr/coroutine';
import {
  buildAttributeDefinition,
  buildCloseNodeTag,
  buildGapTag,
  buildPropertyTag,
  buildSpan,
  deepFreeze,
} from '@bablr/agast-helpers/builders';
import {
  getStreamIterator,
  isEmpty,
  printType,
  StreamIterable,
  wait,
} from '@bablr/agast-helpers/stream';
import { State } from './state.js';
import {
  OpenNodeTag,
  CloseNodeTag,
  GapTag,
  BindingTag,
  LiteralTag,
  ReferenceTag,
  ShiftTag,
  AttributeDefinition,
} from '@bablr/agast-helpers/symbols';
import { streamFromTree, treeFromStreamSync } from '@bablr/agast-helpers/tree';
import * as Tags from '@bablr/agast-helpers/tags';
import * as BTree from '@bablr/agast-helpers/btree';
import { getEmbeddedRegex, getEmbeddedTag } from '@bablr/agast-vm-helpers/deembed';
import { Match } from './match.js';
import { buildEmbeddedRegex, buildWriteEffect } from '@bablr/agast-vm-helpers/builders';
import { has, isString } from '@bablr/agast-helpers/object';
import { reifyBablrOptions } from '@bablr/agast-vm-helpers';
import { buildNode, getTags, list } from '@bablr/agast-helpers/path';
import * as Spans from '@bablr/agast-helpers/spans';
import {
  buildAlternative,
  buildAlternatives,
  buildLiteralElements,
  buildPattern,
} from '@bablr/helpers/builders';

let mergePatterns = (a, b) => {
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;

  let a_ = isString(a) ? [buildAlternative(buildLiteralElements(a))] : list('alternatives', a);
  let b_ = isString(b) ? [buildAlternative(buildLiteralElements(b))] : list('alternatives', b);

  return buildEmbeddedRegex(buildPattern(buildAlternatives([...a_, ...b_])));
};

let unwrapPattern = (pattern) => {
  return isString(pattern) ? pattern : getEmbeddedRegex(pattern);
};

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

export const bablr = (
  ctx,
  rootSource,
  language,
  strategy,
  options = {},
  registerNode = () => {},
) => {
  return new StreamIterable(__bablr(ctx, rootSource, language, strategy, options, registerNode));
};

function* __bablr(ctx, rootSource, rootLanguage, strategy, options, registerNode) {
  let s = null;
  let m = null;
  let finishedMatch = null;
  let outerOptions = options;

  let getState = () => s.getPublic();
  let rootSpans = options.spans || Spans.fromValues([buildSpan('Bare')]);

  s = State.from(rootSource, ctx, rootLanguage, rootSpans);

  s.source.advance();

  if (options.holdUndefinedAttributes) {
    throw new Error('holdUndefinedAttributes not implemented');
  }

  let co = new Coroutine(getStreamIterator(strategy(ctx.getPublic(), getState)));

  co.advance();

  if (s.source.head.step instanceof Promise) {
    yield wait(s.source.head.step);
  }

  for (;;) {
    if (co.current instanceof Promise) {
      co.current = yield wait(co.current);
    }

    if (co.done) {
      if (!s.source.done) {
        throw new Error(`parse ate ${s.source.index} characters but the input was not consumed`);
      }
      if (s.held) throw new Error();

      if (m) throw new Error();

      let { exchange } = s.source;

      s.source.release();

      if (exchange?.sources > 0) {
        throw new Error('Source did not close all forks: ' + exchange.sources);
      }

      return options.tree === undefined || options.tree ? finishedMatch.node : undefined;
    }

    const instr = co.value;
    let returnValue = undefined;

    const { verb } = instr;

    switch (verb) {
      case 'write': {
        const { arguments: { 0: text, 1: { value: writeOptions } = {} } = [] } = instr;

        if (options.emitEffects) {
          yield buildWriteEffect(text, writeOptions);
        }
        break;
      }

      case 'match': {
        let { arguments: { 0: pattern } = [] } = instr;

        let result = s.guardedMatch(pattern);

        if (result instanceof Promise) {
          result = yield wait(result);
        }

        let node = result && treeFromStreamSync(result);

        returnValue = node;
        break;
      }

      case 'advance': {
        const { arguments: { 0: embeddedTags } = [] } = instr;

        const tag = getEmbeddedTag(embeddedTags);

        switch (tag.type) {
          case ReferenceTag: {
            // if (m.didShift) throw new Error();

            m.advance(tag, s);

            break;
          }

          case ShiftTag: {
            let lastProp = Tags.getAt(-1, m.rootNode.value.tags);

            m.advance(tag, s);

            let shiftProp = Tags.getAt(-1, m.rootNode.value.tags);

            let {
              shift: { height, index },
            } = shiftProp.value;

            s.holding = BTree.push(s.holding, buildPropertyTag([null, [], lastProp.value.node]));

            s.depths.shift = height;
            s.depths.nodeShift = index;
            break;
          }

          case BindingTag: {
            m.advance(tag, s);
            break;
          }

          case OpenNodeTag: {
            let { type, literalValue, selfClosing } = tag.value;

            if (literalValue && s.held) {
              throw new Error('cannot advance literal while holding');
            }

            s.depths.path++;
            s.depths.nodeShift = 0;

            if (!m.coveredBoundary.shiftMatch) {
              s.depths.shift = 0;
            }

            m.advance(tag, s);

            if (!type || !s.node) {
              s.node = m.node;
            }

            if (selfClosing) {
              if (literalValue) {
                let result = s.guardedMatch(literalValue);

                if (result instanceof Promise) {
                  result = yield wait(result);
                }

                if (result) {
                  let sourceStep = s.source.advance(getSourceLength(result));

                  if (sourceStep instanceof Promise) {
                    sourceStep = yield wait(sourceStep);
                  }
                } else {
                  throw new Error('Failed to advance literal');
                }
              }

              s.depths.path--;
              s.depths.nodeShift = 0;
              s.depths.shift = 0;
            }

            break;
          }

          case CloseNodeTag: {
            let { node } = m;

            s.depths.path--;
            s.depths.nodeShift = 0;
            s.depths.shift = 0;

            if (m.shiftMatch) {
              let { shift } = Tags.getAt(-1, m.rootNode.value.children).value;
              s.depths.nodeShift = shift.index;
              s.depths.shift = shift.height;
            }

            m.advance(tag, s);

            if (!m.parent) {
              if (!s.source.done) {
                throw new Error('Parser failed to consume input');
              }

              if (Spans.getSize(s.spans) !== Spans.getSize(rootSpans)) {
                throw new Error('Parser did not close all spans');
              }
            }

            if (!node.value.type) {
              s.node = m.node;
            }

            break;
          }

          case LiteralTag: {
            const { value: pattern } = tag;

            if (s.held) throw new Error('cannot advance literal while holding');

            let result = s.guardedMatch(pattern);

            if (result instanceof Promise) {
              result = yield wait(result);
            }

            if (result) {
              let sourceStep = s.source.advance(getSourceLength(result));

              if (sourceStep instanceof Promise) {
                sourceStep = yield wait(sourceStep);
              }

              m.advance(tag, s);
            } else {
              throw new Error('Failed to advance literal');
            }
            break;
          }

          case GapTag: {
            if (!s.held && s.source.value == null && !s.done) {
              const sourceStep = s.source.advance(1);

              if (sourceStep instanceof Promise) {
                yield wait(sourceStep);
              }
            }

            let triviaProp = null;

            if (s.shifted) {
              if (!m.agast.getState().held) throw new Error();
              m.advance(buildNode(tag));

              s.holding = BTree.pop(s.holding);
              break;
            } else if (s.held) {
              throw new Error();
            }

            if (triviaProp) {
              m.advance(triviaProp);
            } else {
              m.advance(tag, s);
            }

            break;
          }

          case AttributeDefinition: {
            const { path, value } = tag.value;

            if (!has(m.node.value.attributes, path)) {
              throw new Error('undefined attributes must be declared');
            }

            if (s.held) throw new Error('invalid place for an attribute binding');

            if (value && typeof value === 'object') throw new Error('unimplemented');

            m.advance(buildAttributeDefinition(path, value));

            break;
          }

          default:
            m.advance(tag, s);
        }

        if (s.depth === 0 && (s.node || s.resultPath?.node)) {
          yield* m.emit(outerOptions);
        }

        returnValue = tag;
        break;
      }

      case 'startSpan': {
        let { arguments: { 0: name, 1: guard = null, 2: { value: props } } = [] } = instr;
        deepFreeze(props);
        s.spans = Spans.push(s.spans, buildSpan(name, guard, props));
        break;
      }

      case 'startSubspan': {
        let { arguments: { 0: name, 1: guard = null, 2: { value: props } } = [] } = instr;
        deepFreeze(props);

        let name_ = name == null ? s.span.name : `${s.span.name}:${name}`;
        let guard_ = mergePatterns(unwrapPattern(guard), unwrapPattern(s.span.guard));
        let props_ = deepFreeze({ ...s.span.props, ...props });

        s.spans = Spans.push(s.spans, buildSpan(name_, guard_, props_));
        break;
      }

      case 'endSpan': {
        if (Spans.getSize(s.spans) <= Spans.getSize(rootSpans)) throw new Error();

        s.spans = Spans.pop(s.spans);
        break;
      }

      case 'eatHeld': {
        if (!s.held) throw new Error();

        if (s.shifted) {
          if (!m.agast.getState().held) throw new Error();
          m.advance(buildNode(buildGapTag()));
        } else {
          m.advance(BTree.getAt(-1, s.holding));
        }

        s.holding = BTree.pop(s.holding);

        yield* m.emit(outerOptions);

        break;
      }

      case 'dropHeld': {
        let { getGapNode } = ctx;
        let empty = isEmpty(streamFromTree(s.held.value.node, { getGapNode }));

        if (!empty) throw new Error();

        s.holding = BTree.pop(s.holding);

        yield* m.emit(outerOptions);
        break;
      }

      case 'startFrame': {
        let { arguments: { 0: verb, 1: { value: matcher } = {}, 2: options = '     ' } = [] } =
          instr;

        m = Match.startFrame(ctx, s, m, null, verb, matcher, reifyBablrOptions(options));
        s = m.state;

        yield* m.emit(outerOptions);

        returnValue = m.getPublic();
        break;
      }

      case 'endFrame': {
        finishedMatch = m;

        finishedMatch.advance(buildCloseNodeTag());

        m = m.endFrame();
        s = m ? m.state : s;

        if (finishedMatch.isNode) {
          registerNode(m.language, m.node);
        }

        if (m) {
          m.running = null;
          if (finishedMatch.shiftMatch) {
            finishedMatch.shiftMatch.running = null;
          }
          yield* m.emit(outerOptions);
        }

        returnValue = m && m.getPublic();
        break;
      }

      case 'shiftFrame': {
        let { arguments: { 0: verb, 1: { value: matcher } = {}, 2: options = '     ' } = [] } =
          instr;

        let parentMatch = m;

        if (finishedMatch.type === '__') throw new Error();

        m = Match.startFrame(
          ctx,
          s,
          parentMatch,
          finishedMatch,
          verb,
          matcher,
          reifyBablrOptions(options),
        );
        s = m ? m.state : s;

        finishedMatch.parent.running = m;
        finishedMatch.running = m;

        yield* finishedMatch.emit(outerOptions);

        returnValue = m && m.getPublic();
        break;
      }

      case 'throw': {
        finishedMatch = m;

        m = m.throw_();

        if (m) {
          yield* m.emit(outerOptions);

          s = m.state;
        }

        returnValue = m && m.getPublic();
        break;
      }

      case 'getState': {
        returnValue = s.getPublic();
        break;
      }

      default: {
        throw new Error(`Unexpected call of {type: ${printType(verb)}}`);
      }
    }

    co.advance(returnValue);
  }
}
