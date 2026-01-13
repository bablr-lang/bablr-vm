/* global WeakSet */
import { Coroutine } from '@bablr/coroutine';
import { buildAttributeDefinition, buildCloseNodeTag } from '@bablr/agast-helpers/builders';
import { getStreamIterator, printType, StreamIterable, wait } from '@bablr/agast-helpers/stream';
import { facades } from './facades.js';
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
import { getRoot, treeFromStreamSync } from '@bablr/agast-helpers/tree';
import * as Tags from '@bablr/agast-helpers/tags';
import { getEmbeddedTag } from '@bablr/agast-vm-helpers/deembed';
import { Match } from './match.js';
import { buildWriteEffect } from '@bablr/agast-vm-helpers/builders';
import { has } from '@bablr/agast-helpers/object';
import { reifyBablrOptions } from '@bablr/agast-vm-helpers';
import { buildNode, getTags } from '@bablr/agast-helpers/path';

const validNodesByLanguage = new Map();

export const isKnownValid = (language, node) => {
  return !!validNodesByLanguage.get(language)?.has(node);
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

export const bablr = (ctx, rootSource, strategy, options = {}) => {
  return new StreamIterable(__bablr(ctx, rootSource, strategy, options));
};

function* __bablr(ctx, rootSource, strategy, options) {
  let s = null;
  let m = null;
  let finishedMatch = null;
  let outerOptions = options;

  let getState = () => s.getPublic();

  for (const language of ctx.languages.values()) {
    validNodesByLanguage.set(language, validNodesByLanguage.get(language) || new WeakSet());
  }

  let co = new Coroutine(getStreamIterator(strategy(facades.get(ctx), getState)));

  co.advance();

  for (;;) {
    if (co.current instanceof Promise) {
      co.current = yield wait(co.current);
    }

    if (co.done) {
      if (!s.source.done) {
        throw new Error(`parse ate ${s.source.index} characters but the input was not consumed`);
      }

      let { exchange } = s.source;

      s.source.release();

      if (exchange?.sources > 0) {
        throw new Error('Source did not close all forks: ' + exchange.sources);
      }

      return co.value;
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

            s.held = lastProp.value.node;

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
              // throw new Error('cannot advance literal while holding');
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

              // s.held = literalValue
              //   ? new NodeFacade(s.resultPath.tag.value.property.node)
              //   : s.resultPath.node;
            }

            break;
          }

          case CloseNodeTag: {
            let { node, language } = m;

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

              if (s.balanced.size) {
                throw new Error('Parser did not match all balanced nodes');
              }
            }

            if (!node.value.type) {
              s.node = m.node;
            }

            validNodesByLanguage.get(language).add(node);

            break;
          }

          case LiteralTag: {
            const { value: pattern } = tag;

            // if (s.held) throw new Error('cannot advance literal while holding');

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
            if (s.source.value == null && !s.done) {
              if (!s.held) {
                const sourceStep = s.source.advance(1);

                if (sourceStep instanceof Promise) {
                  yield wait(sourceStep);
                }
              }
            }

            if (s.held) {
              if (!m.agast.getState().held) throw new Error();
              m.advance(buildNode(tag));

              s.held = null;
              break;
            }

            if (s.expressions.size) {
              let expression = s.expressions.value;
              let node = getRoot(expression);

              m.advance(node);

              s.expressions = s.expressions.pop();
              break;
            }

            if (Tags.getSize(getTags(s.node))) {
              m.advance(tag, s);
            } else {
              m.add(m.node);

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
        let { arguments: { 0: name, 1: guard = null } = [] } = instr;
        s.spans = s.spans.push({ type: 'Instruction', name, guard });
        break;
      }

      case 'endSpan': {
        if (s.spans.value.type !== 'Instruction') throw new Error();
        s.spans = s.spans.pop();
        break;
      }

      case 'startFrame': {
        let { arguments: { 0: verb, 1: { value: matcher } = {}, 2: options = '    ' } = [] } =
          instr;

        m = Match.startFrame(ctx, s, m, null, verb, matcher, reifyBablrOptions(options));
        s = m.state;

        yield* m.emit(outerOptions);

        returnValue = facades.get(m);
        break;
      }

      case 'endFrame': {
        finishedMatch = m;

        finishedMatch.advance(buildCloseNodeTag());

        m = m.endFrame(outerOptions);
        s = m ? m.state : s;

        if (m) {
          m.running = null;
          if (finishedMatch.shiftMatch) {
            finishedMatch.shiftMatch.running = null;
          }
          yield* m.emit(outerOptions);
        }

        returnValue = m && facades.get(m);
        break;
      }

      case 'shiftFrame': {
        let { arguments: { 0: verb, 1: { value: matcher } = {}, 2: options = '    ' } = [] } =
          instr;

        let parentMatch = m;

        if (finishedMatch.type !== '_') throw new Error();

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

        returnValue = m && facades.get(m);
        break;
      }

      case 'throw': {
        finishedMatch = m;

        m = m.throw_();

        if (m) {
          yield* m.emit(outerOptions);

          s = m.state;
        }

        returnValue = m && facades.get(m);
        break;
      }

      case 'getState': {
        returnValue = facades.get(s);
        break;
      }

      case 'init': {
        let { arguments: { 0: canonicalURL } = [] } = instr;

        if (s !== null) throw new Error();

        // TODO get rid of ctx.languages
        s = State.from(rootSource, ctx, ctx.languages.get(canonicalURL), options.expressions);

        s.source.advance();

        const sourceStep = s.source.head.step;

        if (sourceStep instanceof Promise) {
          yield wait(sourceStep);
        }

        returnValue = facades.get(s);
        break;
      }

      default: {
        throw new Error(`Unexpected call of {type: ${printType(verb)}}`);
      }
    }

    co.advance(returnValue);
  }
}
