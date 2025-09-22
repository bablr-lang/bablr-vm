/* global WeakSet */
import { Coroutine } from '@bablr/coroutine';
import {
  buildAttributeDefinition,
  buildBindingTag,
  buildChild,
  buildGapTag,
  buildNodeTag,
  buildProperty,
} from '@bablr/agast-helpers/builders';
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
  InitializerTag,
  AttributeDefinition,
  Property,
} from '@bablr/agast-helpers/symbols';
import * as sym from '@bablr/agast-vm-helpers/symbols';
import { agast, NodeFacade, PathFacade, TagPathFacade as TagPath } from '@bablr/agast-vm';
import {
  buildOpenNodeTag,
  buildReferenceTag,
  buildStubNode,
  getFlagsWithGap,
  getRoot,
  treeFromStreamSync,
} from '@bablr/agast-helpers/tree';
import { getEmbeddedTag } from '@bablr/agast-vm-helpers/deembed';
import { Match } from './match.js';
import { effectsFor, reifyExpression, shouldBranch } from '@bablr/agast-vm-helpers';
import { getProduction } from '@bablr/helpers/grammar';
import { buildEmbeddedNode, buildWriteEffect } from '@bablr/agast-vm-helpers/builders';
import { has } from '@bablr/agast-helpers/object';
import { getFirstNodeProperty, Path, referencesAreEqual } from '@bablr/agast-helpers/path';
import { isPlainObject } from '@bablr/helpers/object';

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
  let language = null;
  let finishedMatch = null;

  for (const language of ctx.languages.values()) {
    validNodesByLanguage.set(language, new WeakSet());
  }

  let co = new Coroutine(getStreamIterator(strategy(facades.get(ctx))));

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

      if (exchange && exchange.sources > 0) {
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
            if (m.agast.state.node.type && tag.value.type === '.') throw new Error();
            if (s.held && s.node.tags.at(2)?.type === InitializerTag) {
              if (!referencesAreEqual(s.node.tags.at(1).value, tag.value) || s.node.tags.size > 3) {
                throw new Error();
              }
            }

            m.advance(tag, s);

            break;
          }

          case ShiftTag: {
            let lastProp = s.node.tags.at(-1);

            m.advance(tag, s);

            s.source.shift();

            let shiftProp = s.node.tags.at(-1);

            let {
              shift: { height, index },
            } = shiftProp.value.property;

            s.held = lastProp.value.property.node;

            s.depths.shift = height;
            s.depths.nodeShift = index;
            s.referenceTagPath = TagPath.from(s.path, 0);
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
              ? s.resultPath && new NodeFacade(s.resultPath.tag.value.property.node)
              : s.resultPath.node;

            if (tag.value.type || literalValue) {
              updateSpans(m, resultNode, 'open');
            }
            if (literalValue) {
              updateSpans(m, resultNode, 'close');
            }

            break;
          }

          case CloseNodeTag: {
            const { node } = s;
            let { language } = m;

            s.depths.path--;
            s.depths.nodeShift = 0;
            s.depths.shift = 0;

            if (m.shiftMatch) {
              let { shift } = mRangeInitial.propertyWrapper.tag.value.property;
              s.depths.nodeShift = shift.index;
              s.depths.shift = shift.height;
            }

            if (node.tags.at(0).value.type) {
              m.advance(tag, s);

              // s.held = buildFacadeProperty(refPath?.tag.value, null, gaplessNode || m.node);

              updateSpans(m, s.resultPath.node, 'close');

              if (!m.parent) {
                if (!s.source.done) {
                  throw new Error('Parser failed to consume input');
                }

                if (s.balanced.size) {
                  throw new Error('Parser did not match all balanced nodes');
                }
              }
            } else {
              m.advance(tag, s);
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
            if (s.source.value == null && (!s.source.done || s.source.holding)) {
              if (s.source.holding) {
                s.source.unshift();
              } else {
                const sourceStep = s.source.advance(1);

                if (sourceStep instanceof Promise) {
                  yield sourceStep;
                }
              }

              if (s.held) {
                if (!s.agast.state.held) throw new Error();
                if (!s.node.flags.token || m.referencePath.tag.value.type === '@') {
                  s.agast.vm.next(buildNodeTag(buildStubNode(tag)));
                } else {
                  s.agast.vm.next(buildGapTag());
                }

                s.resultPath = TagPath.from(s.resultPath.path, -1);

                s.held = null;
                break;
              }

              if (s.expressions.size) {
                let expression = s.expressions.value;
                let node = getRoot(isPlainObject(expression) ? expression : expression.node);

                let mergedBinding = buildBindingTag(m.mergedLanguagePath);

                s.agast.vm.next(mergedBinding);
                s.agast.vm.next(
                  buildChild(
                    Property,
                    buildProperty(s.resultPath.tag.value, mergedBinding.value, node),
                  ),
                );

                s.expressions = s.expressions.pop();
                break;
              }

              if (s.node.tags.size) {
                m.advance(tag, s);
              } else {
                m.add(m.node);

                m.advance(tag, s);
              }

              s.referenceTagPath = null;
            } else {
              throw new Error('Failed to advance gap');
            }
            break;
          }

          case InitializerTag: {
            if (s.held && s.node.tags.at(2)?.type === InitializerTag) {
              throw new Error();
            }
            m.advance(tag, s);
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

      // case 'branch': {
      //   s = s.branch();

      //   // m.node = s.agast.node;

      //   returnValue = facades.get(s);
      //   break;
      // }

      // case 'accept': {
      //   s = s.accept(finishedMatch.fragmentNode);

      //   if (s.depth === 0 && (s.node || s.resultPath?.node)) {
      //     yield* m.emit(options);
      //   }

      //   returnValue = facades.get(s);
      //   break;
      // }

      // case 'reject': {
      //   let finishedState = s;
      //   const { arguments: { 0: embeddedOptions } = [] } = instr;
      //   let options = getEmbeddedObject(embeddedOptions);

      //   s = finishedState.reject(
      //     finishedMatch,
      //     // finishedMatch.effects.success === 'none',
      //     options,
      //   );

      //   s = finishedState.parent;

      //   if (s.depth === 0 && (s.node || s.resultPath?.node)) {
      //     yield* m.emit(options);
      //   }

      //   returnValue = facades.get(s);
      //   break;
      // }

      case 'startFrame': {
        let {
          arguments: { 0: verb, 1: { value: matcher } = {}, 2: { value: options = {} } = {} } = [],
        } = instr;

        let effects = effectsFor(verb.description);
        let isShift = verb.description.startsWith('shift'); // should this be didShift?

        if (shouldBranch(effects)) {
          s = s.branch();
        }

        let parentMatch = m;

        if (!language) throw new Error('not initialized');

        let matcher_ = reifyExpression(matcher);

        if (parentMatch && parentMatch.cover && !parentMatch.isNode) {
          if (matcher_.refMatcher) {
            let m = matcher_.refMatcher;
            if (!['.', '#'].includes(m.type) || m.flags.expression || m.flags.hasGap || m.isArray) {
              throw new Error('no references inside covers');
            }
          }
        }

        if (matcher_.refMatcher?.type === '#' && s.held) {
          s.source.unshift();
        }

        if (isShift && matcher_.nodeMatcher.flags.fragment && !matcher_.nodeMatcher.flags.cover) {
          throw new Error();
        }
        if (isShift && !parentMatch) throw new Error();

        m = parentMatch
          ? parentMatch.startFrame(s, matcher_, effects, isShift ? finishedMatch : null, options)
          : Match.from(ctx, language, s, matcher_, null, options);

        finishedMatch = null;

        if (m.type !== sym.fragment && !getProduction(m.grammar, m.type))
          throw new Error(`Production {type: ${printType(m.type)}} does not exist`);

        if (m.flags.token && !m.isNode) {
          throw new Error('tokens must be nodes');
        }

        if (isShift && (m.isNode || m.isCover)) {
          if (s.node.tags.at(-1, 0)?.type !== ShiftTag) {
            throw new Error('advance shift tag before starting new held frame');
          }
        }

        ({ language } = m);

        returnValue = facades.get(m);

        m.range;
        break;
      }

      case 'endFrame': {
        finishedMatch = m;

        m = m.endFrame();

        if (shouldBranch(finishedMatch.effects)) {
          s = s.accept();
        }

        if (!m) {
          returnValue = m;
          break;
        }

        const refPath = m.referencePath;
        let gaplessNode = null;

        if (refPath?.tag.value.type === '@') {
          let { vm: escapeVm, state: escapeState } = agast();

          let tagPath = PathFacade.from(node).tagPathAt(0);

          while (tagPath) {
            if (tagPath.tag.type === GapTag) {
              throw new Error();
            }
            if (tagPath.tag.type === OpenNodeTag) {
              let { flags, type, attributes, literalValue } = tagPath.tag.value;

              escapeVm.next(
                buildOpenNodeTag(getFlagsWithGap(flags, false), type, attributes, literalValue),
              );
            } else if (tagPath.tag.type === ReferenceTag && tagPath.tag.value.flags.hasGap) {
              let { flags, name, type, isArray, index } = tagPath.tag.value;

              flags = getFlagsWithGap(flags, false);

              escapeVm.next(buildReferenceTag(type, name, isArray, flags, index));
            } else {
              escapeVm.next(tagPath.tag);
            }

            if (tagPath.tag.type === CloseNodeTag && !tagPath.nextUnshifted) {
              gaplessNode = escapeState.resultPath.node;
            }

            tagPath = tagPath.nextUnshifted;
          }
        }

        if (finishedMatch.isNode || finishedMatch.isCover) {
          m.agast.vm.next(
            buildChild(
              Property,
              getFirstNodeProperty(finishedMatch.agast.state.resultPath.node.node),
            ),
          );
          // m.agast.vm.next(buildNodeTag(gaplessNode?.node || finishedMatch.node.node));

          s.node = finishedMatch.node;
        } else {
          // path.advance() needs to be responsible for this!

          s.node = finishedMatch.agast.state.resultPath.node;
          m.agast.vm.next(buildNodeTag(s.node.node));
        }

        if (finishedMatch.effects.success !== 'none') {
        } else {
          // s.referenceTagPath = m.referencePath;
        }
        if (m.propertyMatcher.refMatcher?.type === '#' && s.held) {
          s.source.shift();
        }

        returnValue = m && facades.get(m);
        break;
      }

      case 'throw': {
        finishedMatch = m;

        m = m.throw_();

        if (s.status !== 'rejected') {
          s.reject(finishedMatch);
        }

        s = m.state;

        returnValue = m && facades.get(m);
        break;
      }

      case 'getState': {
        returnValue = facades.get(s);
        break;
      }

      case 'init': {
        let { arguments: { 0: canonicalURL } = [] } = instr;

        if (language !== null) throw new Error();

        s = State.from(rootSource, ctx, canonicalURL, options.expressions);

        s.source.advance();

        const sourceStep = s.source.head.step;

        if (sourceStep instanceof Promise) {
          yield sourceStep;
        }

        language = ctx.languages.get(canonicalURL);

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
