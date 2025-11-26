/* global WeakSet */
import { Coroutine } from '@bablr/coroutine';
import { buildAttributeDefinition, buildGapTag, buildNodeTag } from '@bablr/agast-helpers/builders';
import { getStreamIterator, printType, StreamIterable } from '@bablr/agast-helpers/stream';
import { facades } from './facades.js';
import { State } from './state.js';
import { updateSpans } from './spans.js';
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
import { TagPathFacade as TagPath } from '@bablr/agast-vm';
import { buildStubNode, getRoot, treeFromStreamSync } from '@bablr/agast-helpers/tree';
import { getEmbeddedTag } from '@bablr/agast-vm-helpers/deembed';
import { Match } from './match.js';
import { buildEmbeddedNode, buildWriteEffect } from '@bablr/agast-vm-helpers/builders';
import { has } from '@bablr/agast-helpers/object';

const validNodesByLanguage = new Map();

export const isKnownValid = (language, node) => {
  return !!validNodesByLanguage.get(language)?.has(node);
};

const defineAttribute = (m, path, value) => {
  m.agast.vm.next(buildAttributeDefinition(path, value));
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

  let getState = () => s.getPublic();

  for (const language of ctx.languages.values()) {
    validNodesByLanguage.set(language, validNodesByLanguage.get(language) || new WeakSet());
  }

  let co = new Coroutine(getStreamIterator(strategy(facades.get(ctx), getState)));

  co.advance();

  for (;;) {
    if (co.current instanceof Promise) {
      co.current = yield co.current;
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

      return co.value.node;
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

        let { attributes } = typeof pattern === 'string' && s.node.flags.token ? s.node : pattern;

        let result = s.guardedMatch(pattern, attributes);

        if (result instanceof Promise) {
          result = yield result;
        }

        let node = result && treeFromStreamSync(result);

        returnValue = node && buildEmbeddedNode(node);
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
            let lastProp = m.rootNode.tags.at(-1);

            m.advance(tag, s);

            let shiftProp = m.rootNode.tags.at(-1);

            let {
              shift: { height, index },
            } = shiftProp.value.property;

            s.held = lastProp.value.property.node;

            s.depths.shift = height;
            s.depths.nodeShift = index;
            break;
          }

          case BindingTag: {
            m.advance(tag, s);
            break;
          }

          case OpenNodeTag: {
            let { flags, literalValue, selfClosing } = tag.value;

            s.depths.path++;
            s.depths.nodeShift = 0;

            if (!m.coveredBoundary.shiftMatch) {
              s.depths.shift = 0;
            }

            m.advance(tag, s);

            if (!flags.fragment || !s.node) {
              s.node = m.node;
            }

            if (selfClosing) {
              if (literalValue) {
                let result;
                if (
                  s.resultPath.tag.type === OpenNodeTag &&
                  s.resultPath.tag.value.attributes.balancer &&
                  s.balanced.value?.attributes.balanced === literalValue
                ) {
                  result = s.match(literalValue, tag.value.attributes);
                } else {
                  result = s.guardedMatch(literalValue, tag.value.attributes);
                }

                if (result instanceof Promise) {
                  result = yield result;
                }

                if (result) {
                  let sourceStep = s.source.advance(getSourceLength(result));

                  if (sourceStep instanceof Promise) {
                    sourceStep = yield sourceStep;
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

            let resultNode = literalValue
              ? m.node && m.node.tags.at(-1).value.property.node
              : m.node;

            if (!tag.value.flags.fragment) {
              updateSpans(m, resultNode, 'open');

              if (literalValue) {
                updateSpans(m, resultNode, 'close');
              }
            }

            break;
          }

          case CloseNodeTag: {
            let { node, language } = m;

            s.depths.path--;
            s.depths.nodeShift = 0;
            s.depths.shift = 0;

            if (m.shiftMatch) {
              let { shift } = m.rootNode.children.at(-1).value.property;
              s.depths.nodeShift = shift.index;
              s.depths.shift = shift.height;
            }

            m.advance(tag, s);
            if (!node.tags.at(0).value.flags.fragment) {
              // s.held = buildFacadeProperty(refPath?.tag.value, null, gaplessNode || m.node);

              updateSpans(m, m.node, 'close');
            }

            if (!m.parent) {
              if (!s.source.done) {
                throw new Error('Parser failed to consume input');
              }

              if (s.balanced.size) {
                throw new Error('Parser did not match all balanced nodes');
              }
            }

            if (!node.flags.fragment) {
              s.node = m.node;
            }

            if (!node.equalTo(node)) throw new Error();

            validNodesByLanguage.get(language).add(node);

            break;
          }

          case LiteralTag: {
            const { value: pattern } = tag;

            let result;
            if (
              s.resultPath.tag.type === OpenNodeTag &&
              s.resultPath.tag.value.attributes.balancer &&
              s.balanced.value?.attributes.balanced === pattern
            ) {
              result = s.match(pattern);
            } else {
              result = s.guardedMatch(pattern);
            }

            if (result instanceof Promise) {
              result = yield result;
            }

            if (result) {
              let sourceStep = s.source.advance(getSourceLength(result));

              if (sourceStep instanceof Promise) {
                sourceStep = yield sourceStep;
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
                  yield sourceStep;
                }
              }
            }

            if (s.held) {
              if (!m.agast.state.held) throw new Error();
              if (!s.node.flags.token || m.referencePath.tag.value.type === '@') {
                m.agast.vm.next(buildNodeTag(buildStubNode(tag)));
              } else {
                m.agast.vm.next(buildGapTag());
              }

              s.resultPath = TagPath.from(s.resultPath.path, -1);

              s.held = null;
              break;
            }

            if (s.expressions.size) {
              let expression = s.expressions.value;
              let node = getRoot(expression);

              m.agast.vm.next(buildNodeTag(node));

              s.expressions = s.expressions.pop();
              break;
            }

            if (s.node.tags.size) {
              m.advance(tag, s);
            } else {
              m.add(m.node);

              m.advance(tag, s);
            }
            break;
          }

          case AttributeDefinition: {
            const { path, value } = tag.value;

            if (!has(m.node.attributes, path)) {
              throw new Error('undefined attributes must be declared');
            }

            if (s.held) throw new Error('invalid place for an attribute binding');

            if (value && typeof value === 'object') throw new Error('unimplemented');

            defineAttribute(m, path, value);
            break;
          }

          default:
            m.advance(tag, s);
        }

        if (s.depth === 0 && (s.node || s.resultPath?.node)) {
          yield* m.emit(options);
        }

        returnValue = tag;
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

      case 'startFrame': {
        let {
          arguments: { 0: verb, 1: { value: matcher } = {}, 2: { value: options = {} } = {} } = [],
        } = instr;

        m = Match.startFrame(ctx, s, m, null, verb, matcher, options);
        s = m.state;

        returnValue = facades.get(m);
        break;
      }

      case 'endFrame': {
        finishedMatch = m;

        m = m.endFrame();
        s = m ? m.state : s;

        returnValue = m && facades.get(m);
        break;
      }

      case 'shiftFrame': {
        let {
          arguments: { 0: verb, 1: { value: matcher } = {}, 2: { value: options = {} } = {} } = [],
        } = instr;

        if (!finishedMatch.isCoverBoundary) throw new Error();

        m = Match.startFrame(ctx, s, m, finishedMatch, verb, matcher, options);
        s = m ? m.state : s;

        returnValue = m && facades.get(m);
        break;
      }

      case 'throw': {
        finishedMatch = m;

        m = m.throw_();

        s = m ? m.state : s;

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
          yield sourceStep;
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
