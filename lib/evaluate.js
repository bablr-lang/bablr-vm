import { Coroutine } from '@bablr/coroutine';
import {
  buildAttributeDefinition,
  buildBindingTag,
  buildChild,
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
  DoctypeTag,
  NullTag,
  ShiftTag,
  InitializerTag,
  AttributeDefinition,
  Property,
} from '@bablr/agast-helpers/symbols';
import * as sym from '@bablr/agast-vm-helpers/symbols';
import { agast, PathFacade, TagPathFacade as TagPath } from '@bablr/agast-vm';
import { states } from './node.js';
import {
  buildOpenNodeTag,
  buildReferenceTag,
  buildStubNode,
  getFlagsWithGap,
  getRoot,
  treeFromStreamSync,
} from '@bablr/agast-helpers/tree';
import { getEmbeddedObject, getEmbeddedTag } from '@bablr/agast-vm-helpers/deembed';
import { Match } from './match.js';
import { effectsFor, reifyExpression } from '@bablr/agast-vm-helpers';
import { getProduction } from '@bablr/helpers/grammar';
import { buildEmbeddedNode, buildWriteEffect } from '@bablr/agast-vm-helpers/builders';
import { has } from '@bablr/agast-helpers/object';
import { referencesAreEqual } from '@bablr/agast-helpers/path';

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
  let doctype = null;

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

      s.source.release();

      if (s.source.exchange.forks !== 0) {
        throw new Error('Source did not close all forks: ' + s.source.exchange.forks);
      }

      return co.value && states.get(co.value).node;
    }

    const instr = co.value;
    let returnValue = undefined;

    const { verb } = instr;

    switch (verb) {
      case 'init': {
        let { arguments: { 0: canonicalURL } = [] } = instr;

        if (language !== null) throw new Error();

        s = State.from(rootSource, ctx, canonicalURL, options.expressions);

        s.source.advance();

        const sourceStep = s.source.fork.head.step;

        if (sourceStep instanceof Promise) {
          yield sourceStep;
        }

        language = ctx.languages.get(canonicalURL);

        returnValue = facades.get(s);
        break;
      }

      case 'advance': {
        const { arguments: { 0: embeddedTags } = [] } = instr;

        const tag = getEmbeddedTag(embeddedTags);

        if (tag.type !== ReferenceTag) {
          s.referenceTagPath = null;
        }

        if (
          !m.isNode &&
          m.coveredBoundary !== m &&
          !((s.holding && tag.type === GapTag) || tag.type === OpenNodeTag)
        ) {
          throw new Error('cannot advance inside a cover');
        }

        switch (tag.type) {
          case DoctypeTag: {
            doctype = tag;
            break;
          }

          case ReferenceTag: {
            if (s.node.type && tag.value.type === '.') throw new Error();
            if (s.held && s.node.children.at(2)?.type === InitializerTag) {
              if (!referencesAreEqual(s.node.children.at(1), tag) || s.node.children.size > 3) {
                throw new Error();
              }
            }

            m.advance(tag, s);

            s.referenceTagPath = TagPath.fromNode(s.node, -1);
            if (s.referenceTagPath.tag.type === BindingTag) throw new Error();
            break;
          }

          case ShiftTag: {
            let { index, height } = tag.value;
            let refTag = s.node.children.at(-3);
            let lastShiftTag = refTag;

            if (refTag.type === ShiftTag) {
              refTag = s.node.children.at(-3 - refTag.value.index * 3);
            }

            if (refTag.type !== ReferenceTag) throw new Error();

            s.depths.shift = height;
            s.depths.nodeShift = index;

            if (index !== (lastShiftTag.type === ShiftTag ? lastShiftTag.value.index + 1 : 1)) {
              throw new Error();
            }

            s.source.shift();
            s.held = Object.freeze({
              reference: refTag.value,
              binding: s.resultPath.tag.value,
              node: s.resultPath.nextSibling.inner.node,
            });

            m.advance(tag, s);
            s.referenceTagPath = TagPath.fromNode(s.node, -1);
            break;
          }

          case BindingTag: {
            m.advance(tag, s);

            let propertyChild = buildChild(
              sym.Property,
              buildProperty(s.held.reference, tag.value, s.held.node.node),
            );

            s.agast.vm.next(propertyChild);

            s.held = null;
            break;
          }

          case OpenNodeTag: {
            s.depths.path++;
            s.depths.nodeShift = 0;

            if (!m.coveredBoundary.shiftMatch) {
              s.depths.shift = 0;
            }

            s.agast = m.agast;

            if (s.depths.path === 0) {
              m.advance(doctype);
              m.setRangePreviousIndex(0);
            }

            m.advance(tag, s);

            if (tag.value.type) {
              updateSpans(m, s.node, 'open');
            }

            break;
          }

          case CloseNodeTag: {
            const { node } = s;

            s.depths.path--;
            s.depths.nodeShift = 0;
            s.depths.shift = 0;

            if (m.rangeInitial.tag.type === ShiftTag) {
              s.depths.nodeShift = m.rangeInitial.tag.value.index;
              s.depths.shift = m.rangeInitial.tag.value.height;
            }

            if (node.children.at(0).value.type) {
              const refPath = m.referencePath;

              m.advance(tag, s);
              let gaplessNode = null;

              if (refPath?.tag.value.type === '@') {
                let { vm: escapeVm, state: escapeState } = agast();

                let tagPath = PathFacade.from(node).tagPathAt(0);

                while (tagPath) {
                  let vmReturn = null;
                  if (tagPath.tag.type === GapTag) {
                    break;
                  }
                  if (tagPath.tag.type === OpenNodeTag) {
                    let { flags, language, type, attributes } = tagPath.tag.value;

                    if (tagPath.node.flags.hasGap) {
                      vmReturn = escapeVm.next(
                        buildOpenNodeTag(getFlagsWithGap(flags, false), language, type, attributes),
                      );
                    } else {
                      vmReturn = escapeVm.next(
                        buildChild(
                          sym.Property,
                          buildProperty(
                            tagPath.path.reference.value,
                            tagPath.path.referenceTagPath.nextSibling.tag.value,
                            tagPath.node.node,
                          ),
                        ),
                      );
                      tagPath = tagPath.path.tagPathAt(-1).nextUnshifted;
                      continue;
                    }
                  } else if (tagPath.tag.type === ReferenceTag && tagPath.tag.value.flags.hasGap) {
                    let { flags, name, type, isArray, index } = tagPath.tag.value;

                    flags = getFlagsWithGap(flags, false);

                    vmReturn = escapeVm.next(buildReferenceTag(type, name, isArray, flags, index));
                  } else {
                    vmReturn = escapeVm.next(tagPath.tag);
                  }

                  if (tagPath.tag.type === CloseNodeTag && !tagPath.nextUnshifted) {
                    gaplessNode = vmReturn.value;
                  }

                  tagPath = tagPath.nextUnshifted;
                }
              }

              s.agast = m.agastFragment;

              s.held = Object.freeze({
                reference: refPath.tag.value,
                binding: null,
                node: gaplessNode || m.node,
              });

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
              s.agast = m.agastFragment;
            }

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
                s.agast.vm.next(
                  buildChild(
                    Property,
                    buildProperty(
                      s.resultPath.tag.value,
                      buildBindingTag(null).value,
                      buildStubNode(tag),
                    ),
                  ),
                );

                s.resultPath = TagPath.fromNode(s.resultPath.node, -1);

                s.held = null;
                break;
              }

              if (s.expressions.size) {
                const expression = s.expressions.value;

                s.agast.vm.next(buildProperty(reference, binding, getRoot(expression.node)));

                s.expressions = s.expressions.pop();
                break;
              }

              if (s.node.children.size) {
                m.advance(tag, s);
              } else {
                m.add(m.node);

                m.advance(tag, s);
              }

              s.referenceTagPath = null;

              s.agast = m.agastFragment;
            } else {
              throw new Error('Failed to advance gap');
            }
            break;
          }

          case InitializerTag: {
            if (s.held && s.node.children.at(2)?.type === InitializerTag) {
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

      case 'match': {
        let { arguments: { 0: pattern } = [] } = instr;

        let result = s.guardedMatch(pattern);

        if (result instanceof Promise) {
          result = yield result;
        }

        let node = result && treeFromStreamSync(result);

        returnValue = node && buildEmbeddedNode(node);
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

      case 'branch': {
        s = s.branch();

        // m.node = s.agast.node;

        returnValue = facades.get(s);
        break;
      }

      case 'accept': {
        s = s.accept(finishedMatch.fragmentNode);

        if (s.depth === 0 && (s.node || s.resultPath?.node)) {
          yield* m.emit(options);
        }

        returnValue = facades.get(s);
        break;
      }

      case 'reject': {
        let finishedState = s;
        const { arguments: { 0: embeddedOptions } = [] } = instr;
        let options = getEmbeddedObject(embeddedOptions);

        s = finishedState.reject(
          finishedMatch,
          // finishedMatch.effects.success === 'none',
          options,
        );

        s = finishedState.parent;

        if (s.depth === 0 && (s.node || s.resultPath?.node)) {
          yield* m.emit(options);
        }

        returnValue = facades.get(s);
        break;
      }

      case 'startFrame': {
        let {
          arguments: { 0: verb, 1: { value: matcher } = {}, 2: { value: options = {} } = {} } = [],
        } = instr;

        let effects = effectsFor(verb.description);
        let didShift = verb.description.startsWith('holdFor');

        let parentMatch = m;

        if (!language) throw new Error('not initialized');

        let matcher_ = reifyExpression(matcher);

        if (didShift && !parentMatch) throw new Error();

        m = parentMatch
          ? parentMatch.startFrame(s, matcher_, effects, didShift ? finishedMatch : null, options)
          : Match.from(ctx, language, s, matcher_, null, options);

        finishedMatch = null;

        if (m.isNode && m.isCover) throw new Error();

        if (m.type !== sym.fragment && !getProduction(m.grammar, m.type))
          throw new Error(`Production {type: ${printType(m.type)}} does not exist`);

        if (m.flags.token && !m.isNode) {
          throw new Error('tokens must be nodes');
        }

        if (parentMatch && parentMatch.cover && !m.isNode) {
          if (matcher_.refMatcher) {
            let m = matcher_.refMatcher;
            if (m.flags.expression || m.flags.hasGap || m.isArray) {
              throw new Error('no references inside covers');
            }
          }
        }

        if (didShift) {
          if (s.node.children.at(-1)?.type !== ShiftTag) {
            throw new Error('advance shift tag before starting new held frame');
          }
        }

        m.agastFragment = s.agast;

        ({ language } = m);

        if (parentMatch) {
          let previousIndex = [CloseNodeTag, NullTag, GapTag].includes(s.resultPath.tag.type)
            ? m.fragmentNode.children.size - 1
            : s.resultPath.childrenIndex;

          m.setRangePreviousIndex(m.isNode ? previousIndex - 1 : previousIndex);
        }

        returnValue = facades.get(m);

        m.range;
        break;
      }

      case 'endFrame': {
        finishedMatch = m;

        m = m.endFrame();

        s.agast = finishedMatch.agastFragment;

        if (!m) {
          returnValue = m;
          break;
        }

        returnValue = m && facades.get(m);
        break;
      }

      case 'throw': {
        finishedMatch = m;

        m = m.throw_();

        if (m && finishedMatch.s === s) {
          s.agast = m.agast;
        }

        returnValue = m && facades.get(m);
        break;
      }

      case 'write': {
        const { arguments: { 0: text, 1: { value: writeOptions } = {} } = [] } = instr;

        if (options.emitEffects) {
          yield buildWriteEffect(text, writeOptions);
        }
        break;
      }

      case 'getState': {
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
