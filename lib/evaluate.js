import { Coroutine } from '@bablr/coroutine';
import { buildOpenNodeTag, buildShiftTag } from '@bablr/agast-helpers/builders';
import { getStreamIterator, printType, StreamIterable } from '@bablr/agast-helpers/stream';
import { formatType } from './utils/format.js';
import { facades } from './facades.js';
import { nodeStates, State } from './state.js';
import { updateSpans } from './spans.js';
import {
  OpenNodeTag,
  CloseNodeTag,
  GapTag,
  LiteralTag,
  ReferenceTag,
  DoctypeTag,
  NullTag,
  ShiftTag,
} from '@bablr/agast-helpers/symbols';
import * as sym from '@bablr/agast-vm-helpers/symbols';
import { FragmentFacade, states } from './node.js';
import { getOpenTag, treeFromStreamSync } from '@bablr/agast-helpers/tree';
import * as sumtree from '@bablr/agast-helpers/sumtree';
import { getEmbeddedObject, getEmbeddedTag } from '@bablr/agast-vm-helpers/deembed';
import { Match } from './match.js';
import { effectsFor, reifyExpression } from '@bablr/agast-vm-helpers';
import { TagPath } from '@bablr/agast-helpers/path';
import { getProduction } from '@bablr/helpers/grammar';
import { buildWriteEffect } from '@bablr/agast-vm-helpers/builders';

const bindAttribute = (m, s, key, value) => {
  const openTag = getOpenTag(m.node);

  if (value != null) {
    const { flags, language, type } = openTag.value;
    const attributes = { ...openTag.value.attributes, [key]: value };
    const newOpenTag = buildOpenNodeTag(flags, language, type, attributes);

    m.node.attributes = attributes;

    // if (openNext) {
    // } else {
    //   // could this tag be stored anywhere else?
    //   s.resultPath = newOpenTag;
    // }

    m.node.children = sumtree.replaceAt(0, m.node.children, newOpenTag);
  }

  nodeStates.get(m.node).unboundAttributes.delete(key);
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

  let co = new Coroutine(getStreamIterator(strategy(facades.get(ctx))));

  co.advance();

  for (;;) {
    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }

    if (co.done) {
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
          s.referencePath = null;
        }

        if (m.cover && !m.isNode && !(s.holding && tag.type === GapTag))
          throw new Error('cannot advance inside a cover');

        switch (tag.type) {
          case DoctypeTag: {
            s.node = m.node;
            s.node.type = null;
            s.node.language = tag.value.attributes.bablrLanguage;
            s.advance(tag);

            m.setRangePreviousIndex(0);
            break;
          }

          case ReferenceTag: {
            s.advance(tag);

            s.referencePath = TagPath.fromNode(s.node, -1);
            if (s.referencePath.tag.type === GapTag) throw new Error();
            break;
          }

          case OpenNodeTag: {
            s.depths.path++;

            if (tag.value.type) {
              m.add(m.node);

              s.node = m.node;
            }

            s.advance(tag);

            if (tag.value.type) {
              updateSpans(m, s.node, 'open');
            }

            break;
          }

          case CloseNodeTag: {
            const { node } = s;

            s.depths.path--;

            if (sumtree.getAt(0, node.children).value.type) {
              const refPath = m.unshiftedReferencePath;

              if (refPath?.tag.type === ReferenceTag && refPath?.tag.value.name === '@') {
                const cooked = node.flags.hasGap
                  ? null
                  : ctx.languages
                      .get(node.language)
                      .getCooked?.(
                        FragmentFacade.wrap(
                          node,
                          ctx,
                          true,
                          [refPath.childrenIndex, refPath.childrenIndex + 1],
                          null,
                        ),
                        s.span.name,
                        facades.get(ctx),
                      ) || null;

                bindAttribute(m, s, 'cooked', cooked);

                nodeStates.get(m.node).unboundAttributes.delete('cooked');
              }

              s.advance(tag);

              // if (s.depth > 0) {
              //   m.add(m.node);
              // }

              s.node = m.fragmentNode;

              updateSpans(m, s.resultPath.path.node, 'close');

              if (!m.parent) {
                if (!s.source.done) {
                  throw new Error('Parser failed to consume input');
                }

                if (s.balanced.size) {
                  throw new Error('Parser did not match all balanced nodes');
                }
              }
            } else {
              s.advance(tag);
              s.node = m.fragmentNode;
            }

            break;
          }

          case LiteralTag: {
            const { value: pattern } = tag;

            let result;
            if (
              s.resultPath.tag.type === OpenNodeTag &&
              s.resultPath.tag.value.attributes.balancer &&
              s.balanced.value.attributes.balanced === pattern
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

              s.advance(tag);
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
                m.add(s.held);

                s.resultPath = TagPath.fromNode(s.resultPath.node, -1);

                s.held = null;
                break;
              }

              if (s.expressions.size) {
                const expression = s.expressions.value;

                m.add(expression);

                s.expressions = s.expressions.pop();
                break;
              }

              if (sumtree.getSize(s.node.children)) {
                s.advance(tag);
              } else {
                m.add(m.node);

                s.advance(tag);
              }

              s.referencePath = null;

              s.node = m.fragmentNode;
            } else {
              throw new Error('Failed to advance gap');
            }
            break;
          }

          default:
            s.advance(tag);
        }

        if (s.depth === 0) {
          yield* m.emit();
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

        returnValue = result && FragmentFacade.wrap(node, ctx, true);
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

        returnValue = facades.get(s);
        break;
      }

      case 'accept': {
        s = s.accept(finishedMatch.fragmentNode);

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

        returnValue = facades.get(s);
        break;
      }

      case 'startFrame': {
        let {
          arguments: { 0: verb, 1: { value: matcher } = {}, 2: { value: options = {} } = {} } = [],
        } = instr;

        let effects = effectsFor(verb.description);
        let didShift = verb.description.startsWith('holdFor');

        let { unboundAttributes } = options;

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
            if (!(m.name === '.' && !m.flags.expression && !m.flags.hasGap && !m.isArray)) {
              throw new Error('no references inside covers');
            }
          }
        }

        if (didShift) {
          s.source.shift();
          s.held = s.resultPath.node;

          let refTag = sumtree.getAt(-2, s.node.children);

          s.advance(buildShiftTag(refTag.type === ShiftTag ? refTag.value.index + 1 : 1));
          s.referencePath = TagPath.fromNode(s.node, -1);
        }

        if (!m.isNode && options.unboundAttributes) throw new Error();

        m.fragmentNode = s.node;

        nodeStates.set(m.node, {
          unboundAttributes: m.isNode
            ? new Set(unboundAttributes)
            : new Set(parentMatch ? nodeStates.get(parentMatch.node).unboundAttributes || [] : []),
        });

        ({ language } = m);

        if (parentMatch) {
          let previousIndex = [CloseNodeTag, NullTag, GapTag].includes(s.resultPath.tag.type)
            ? sumtree.getSize(m.fragmentNode.children) - 1
            : s.resultPath.childrenIndex;

          m.setRangePreviousIndex(previousIndex);
        }

        returnValue = facades.get(m);

        m.range;
        break;
      }

      case 'endFrame': {
        const {
          arguments: { 0: hasContinuation },
        } = instr;
        finishedMatch = m;

        m = m.endFrame();

        if (!m) {
          returnValue = m;
          break;
        }

        if (finishedMatch.state.status !== 'rejected') {
          yield* m.emit();
        }

        returnValue = m && facades.get(m);
        break;
      }

      case 'throw': {
        finishedMatch = m;

        m = m.throw_();

        s.status = 'rejected';
        if (finishedMatch.s === s) {
          s.node = m.node;
        }

        if (!m) throw new Error();

        returnValue = m && facades.get(m);
        break;
      }

      case 'bindAttribute': {
        const { arguments: { 0: key, 1: value } = [] } = instr;

        bindAttribute(m, s, key, value);

        yield* m.emit();

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
        throw new Error(`Unexpected call of {type: ${formatType(verb)}}`);
      }
    }

    co.advance(returnValue);
  }

  return s.node;
}
