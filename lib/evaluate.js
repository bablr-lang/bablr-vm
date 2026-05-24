import {
  buildGapTag,
  buildReferenceTag,
  buildSpanEntry,
  parseLiteralTag,
  parseObject,
  parseTag,
  parseTagType,
} from '@bablr/agast-helpers/builders';
import {
  continue_,
  getStreamIterator,
  isEmpty,
  printSource,
  printType,
  streamFromString,
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
import { printObject, printTag, streamFromTree, treeFromStream } from '@bablr/agast-helpers/tree';
import * as Tags from '@bablr/agast-helpers/tags';

import { getEmbeddedTag } from '@bablr/agast-vm-helpers/deembed';
import { Match, buildNode } from './match.js';
import {
  buildEmbeddedRegexMatcher,
  buildEmbeddedStringMatcher,
  parseRegexPattern,
} from '@bablr/agast-vm-helpers/builders';
import { freeze, has, isFrozen, isString } from '@bablr/agast-helpers/object';
import { effectsFor, reifyBablrOptions, shouldBranch } from '@bablr/agast-vm-helpers';
import * as BList from '@bablr/agast-helpers/b-list';
import * as BListKeyed from '@bablr/agast-helpers/b-list-keyed';
import { defaultRegexFlags, writePattern } from '@bablr/helpers/builders';
import { freezeRecord } from '@bablr/record';
import { arrayValues } from '@bablr/agast-helpers/iterable';

let flagsEqual = (a, b) => {
  return (
    a.dotAll === b.dotAll &&
    a.global === b.global &&
    a.ignoreCase === b.ignoreCase &&
    a.multiline === b.multiline &&
    a.sticky === b.sticky &&
    a.unicode === b.unicode
  );
};

let stickyRegexFlags = freezeRecord({ ...defaultRegexFlags, sticky: true });

let mergePatterns = (a, b) => {
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;

  let a_ = isString(a)
    ? freezeRecord({
        expression: freezeRecord({ group: true, alternatives: freezeRecord([freezeRecord([a])]) }),
        flags: stickyRegexFlags,
      })
    : parseRegexPattern(a.value);
  let b_ = isString(b)
    ? freezeRecord({
        expression: freezeRecord({
          capture: true,
          alternatives: freezeRecord([freezeRecord([b])]),
        }),
        flags: stickyRegexFlags,
      })
    : parseRegexPattern(b.value);

  if (!flagsEqual(a_.flags, b_.flags)) throw new Error();

  return buildEmbeddedRegexMatcher(
    printSource(
      writePattern(
        freezeRecord({
          expression: freezeRecord({
            capture: true,
            alternatives: freezeRecord([
              ...arrayValues(a_.expression.alternatives),
              ...arrayValues(b_.expression.alternatives),
            ]),
          }),
          flags: a_.flags,
        }),
      ),
    ),
  );
};

const getSourceLength = (tags) => {
  let i = 0;
  for (const tag of tags) {
    let tagType = parseTagType(tag);
    if (tagType === LiteralTag) {
      i += parseLiteralTag(tag).value.length;
    } else if (tagType === GapTag) {
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
  options = freeze({ emitEffects: false }),
  registerNode = () => {},
) => {
  if (!isFrozen(options)) throw new Error();

  if (options.holdUndefinedAttributes) {
    throw new Error('holdUndefinedAttributes not implemented');
  }
  return new StreamIterable(__bablr(ctx, rootSource, language, strategy, options, registerNode));
};

function* __bablr(ctx, rootSource, rootLanguage, strategy, options) {
  let s = null;
  let m = null;
  let finishedMatch = null;
  let outerOptions = options;

  let getState = () => s.getPublic();
  let rootSpans = options.spans || BListKeyed.fromValues([buildSpanEntry('Bare')]);

  s = State.from(rootSource, ctx, rootLanguage, rootSpans);

  s.source.advance();

  let iter = getStreamIterator(strategy(ctx.getPublic(), getState));
  let step, returnValue;

  for (;;) {
    step = iter.next(returnValue);

    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = iter.next());
      if (step instanceof Promise) step = yield wait(step);
    }

    if (step.done) {
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

      return options.tree ? finishedMatch.node : undefined;
    }

    let instr = step.value;
    let { verb } = instr;

    switch (verb) {
      case 'write': {
        let { arguments: { 0: text } = [] } = instr;

        if (options.emitEffects) {
          yield `<-2>`;
          yield* streamFromString(text);
          yield `<-1>`;
        }
        break;
      }

      case 'match': {
        let { arguments: { 0: pattern } = [] } = instr;

        let result = yield* s.guardedMatch(pattern);

        let node = result && treeFromStream(result);

        returnValue = node;
        break;
      }

      case 'advance': {
        const { arguments: { 0: embeddedTag } = [] } = instr;

        if (!isString(embeddedTag.value)) throw new Error();

        const tag = parseTag(getEmbeddedTag(embeddedTag));

        switch (tag.type) {
          case ReferenceTag: {
            // if (m.didShift) throw new Error();

            m.advance(embeddedTag.value, s);

            break;
          }

          case ShiftTag: {
            let lastProp = Tags.getAt(-1, m.rootNode.value.tags);

            m.advance(embeddedTag.value, s);

            let shiftProp = Tags.getAt(-1, m.rootNode.value.tags);

            let {
              shift: { height, index },
            } = shiftProp.value;

            s.holding = BList.push(
              freeze({ matchDepth: m.depth, node: lastProp.value.node }),
              s.holding,
            );
            s.holdingMatches = BList.push(m, s.holdingMatches);

            s.depths.shift = height;
            s.depths.nodeShift = index;
            break;
          }

          case BindingTag: {
            m.advance(embeddedTag.value, s);
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

            if (selfClosing) {
              if (literalValue) {
                let result = yield* s.guardedMatch(buildEmbeddedStringMatcher(literalValue));

                if (result) {
                  let sourceStep = s.source.advance(getSourceLength(result));

                  while (sourceStep === null || sourceStep instanceof Promise) {
                    if (sourceStep === null) yield continue_(), (sourceStep = iter.next());
                    if (sourceStep instanceof Promise) sourceStep = yield wait(sourceStep);
                  }
                } else {
                  throw new Error('Failed to advance literal');
                }
              }

              if (s.resultPath.depth >= 1) {
                s.node = buildNode(tag);
                s.holding = BList.push(freeze({ matchDepth: m.depth, node: s.node }), s.holding);
              } else {
                m.advance(embeddedTag.value, s);
              }

              s.depths.path--;
              s.depths.nodeShift = 0;
              s.depths.shift = 0;
            } else {
              m.advance(embeddedTag.value, s);

              if (!type || !s.node) {
                s.node = m.node;
              }
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

            m.advance(embeddedTag.value, s);

            if (!m.parent) {
              if (!s.source.done) {
                throw new Error('Parser failed to consume input');
              }

              if (BListKeyed.getSize(s.spans) !== BListKeyed.getSize(rootSpans)) {
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

            let result = yield* s.guardedMatch(buildEmbeddedStringMatcher(pattern));

            if (result) {
              let sourceStep = s.source.advance(getSourceLength(result));

              while (sourceStep === null || sourceStep instanceof Promise) {
                if (sourceStep === null) yield continue_(), (sourceStep = iter.next());
                if (sourceStep instanceof Promise) sourceStep = yield wait(sourceStep);
              }

              m.advance(embeddedTag.value, s);
            } else {
              throw new Error('Failed to advance literal');
            }
            break;
          }

          case GapTag: {
            // if (BList.getSize(s.holding) > 1) throw new Error();

            if (s.shifted) {
              if (!m.agast.getState().held) throw new Error();
              m.advance(buildNode('<//>'));

              s.holding = BList.pop(s.holding);
              s.holdingMatches = BList.pop(s.holdingMatches);
              break;
            } else if (s.held) {
              throw new Error();
            } else if (s.source.value == null) {
              let sourceStep = s.source.advance(1);

              while (sourceStep === null || sourceStep instanceof Promise) {
                if (sourceStep === null) yield continue_(), (sourceStep = iter.next());
                if (sourceStep instanceof Promise) sourceStep = yield wait(sourceStep);
              }
            } else {
              throw new Error();
            }

            m.advance(embeddedTag.value, s);

            break;
          }

          case AttributeDefinition: {
            const { path, value } = tag.value;

            if (!has(m.node.value.attributes, path)) {
              throw new Error('undefined attributes must be declared');
            }

            if (s.shifted) throw new Error('invalid place for an attribute binding');

            if (value && typeof value === 'object') throw new Error('unimplemented');

            m.advance(embeddedTag.value);

            break;
          }

          default:
            m.advance(embeddedTag.value, s);
        }

        if (s.depth === 0 && (s.node || s.resultPath?.node)) {
          yield* m.emit(outerOptions);
        }

        returnValue = tag;
        break;
      }

      case 'startSpan': {
        let { arguments: { 0: name, 1: guard = null, 2: merge = false, 3: props } = [] } = instr;
        if (!isString(props)) throw new Error();

        if (merge) {
          let name_ = name == null ? s.span.name : `${s.span.name}:${name}`;
          let guard_ = mergePatterns(guard, s.span.guard);
          let props_ = printObject({ ...parseObject(s.span.props), ...parseObject(props) });

          s.spans = BListKeyed.push(buildSpanEntry(name_, guard_, props_), s.spans);
        } else {
          s.spans = BListKeyed.push(buildSpanEntry(name, guard, props), s.spans);
        }
        break;
      }

      case 'endSpan': {
        if (BListKeyed.getSize(s.spans) <= BListKeyed.getSize(m.rootSpans)) throw new Error();
        s.spans = BListKeyed.pop(s.spans);
        break;
      }

      case 'eatHeld': {
        if (!s.held) throw new Error();

        if (s.shifted) {
          if (!m.agast.getState().held) throw new Error();
          m.advance(buildNode(buildGapTag()));
        } else {
          m.advance(finishedMatch.shiftMatch ? Tags.getAt(-2, s.held.value.tags) : s.held);
          if (!finishedMatch.parentTagPath) {
            finishedMatch.parentTagPath = s.resultPath.propertyPath;
          }
        }

        s.holding = BList.pop(s.holding);
        s.holdingMatches = BList.pop(s.holdingMatches);

        yield* m.emit(outerOptions);

        break;
      }

      case 'pinHeld': {
        if (!s.held) throw new Error();

        let holding = BList.getAt(-1, s.holding);

        s.holding = BList.replaceAt(
          -1,
          freeze({ matchDepth: m.depth, node: holding.node }),
          s.holding,
        );
        s.holdingMatches = BList.replaceAt(-1, m, s.holdingMatches);

        yield* m.emit(outerOptions);

        break;
      }

      case 'dropHeld': {
        if (!s.held) throw new Error();

        let { getGapNode } = ctx;
        let empty = isEmpty(streamFromTree(s.held, { getGapNode }));

        if (!empty) throw new Error();

        s.holding = BList.pop(s.holding);
        s.holdingMatches = BList.pop(s.holdingMatches);

        yield* m.emit(outerOptions);
        break;
      }

      case 'returnHeld': {
        if (!s.held) throw new Error();

        let held = BList.getAt(-1, s.holding);
        let holdingMatch = BList.getAt(-1, s.holdingMatches);

        s.holding = BList.pop(s.holding);
        s.holdingMatches = BList.pop(s.holdingMatches);
        s.returning = BList.push(held, s.returning);
        if (m.emittedMatch.state.depth === s.depth) {
          let returned;
          while ((returned = BList.getAt(-1, s.returning))?.matchDepth === m.emittedMatch.depth) {
            holdingMatch.advance(returned.node);
            s.returning = BList.pop(s.returning);
          }
          m.emitted = holdingMatch.emitted;
        }

        yield* m.emit(outerOptions);
        break;
      }

      case 'call': {
        let { arguments: { 0: verb, 1: matcher, 2: options = '      ' } = [] } = instr;

        if (verb === Symbol.for('shift') || verb === Symbol.for('shiftMatch')) {
          let parentMatch = m;

          if (finishedMatch.type === Symbol.for('__')) throw new Error();

          let { literalValue: literalMatcher } = matcher.value.nodeMatcher.value;

          let literalValue = null;
          if (literalMatcher) {
            let result = yield* s.guardedMatch(literalMatcher);
            literalValue = result && treeFromStream(result);
          }

          if (shouldBranch(effectsFor(verb.description)) && !literalMatcher) {
            s = s.branch();
          }

          m = Match.startFrame(
            ctx,
            s,
            parentMatch,
            finishedMatch,
            verb,
            matcher,
            literalValue,
            reifyBablrOptions(options),
          );
          s = m ? m.state : s;

          if (literalMatcher && !literalValue && effectsFor(verb.description).failure !== 'none') {
            s.reject(m);
          }

          finishedMatch.parent.running = m;
          finishedMatch.running = m;

          yield* m.emit(outerOptions);

          returnValue = m && m.getPublic();
        } else {
          let { literalValue: literalMatcher } = matcher.value.nodeMatcher.value;

          let failed = false;
          let literalValue = null;
          if (literalMatcher) {
            if (isString(literalMatcher)) {
              throw new Error();
            }

            let result = yield* s.guardedMatch(literalMatcher);
            failed = !result;
            literalValue = result && treeFromStream(result);
          }

          if (shouldBranch(effectsFor(verb.description)) && !literalMatcher) {
            s = s.branch();
          }

          m = Match.startFrame(
            ctx,
            s,
            m,
            null,
            verb,
            matcher,
            literalValue,
            reifyBablrOptions(options),
          );

          if (literalMatcher && !literalValue && effectsFor(verb.description).failure !== 'none') {
            s.reject(m);
          }

          if (!failed) {
            yield* m.emit(outerOptions);
          }

          returnValue = m.getPublic();
        }
        break;
      }

      case 'return': {
        finishedMatch = m;

        finishedMatch.advance('</>');

        m = m.return();
        s = m ? m.state : s;

        if (finishedMatch.isNode || finishedMatch.isCover) {
          ctx.registerNode(finishedMatch.language, finishedMatch.node);
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

      case 'throw': {
        if (m.shiftMatch) {
          finishedMatch = m.shiftMatch;
        }

        m = m.throw_();

        if (m) {
          if (s.depth === 0) {
            yield* m.emit(outerOptions);
          }

          s = m.state;
        }

        returnValue = m && m.getPublic();
        break;
      }

      case 'getState': {
        returnValue = s.getPublic();
        break;
      }

      case 'debugger': {
        debugger;
        break;
      }

      default: {
        throw new Error(`Unexpected call of {type: ${printType(verb)}}`);
      }
    }
  }
}
