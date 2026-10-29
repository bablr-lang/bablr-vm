import {
  buildEscapeTag,
  buildGapTag,
  parseLiteralTag,
  parseObject,
  parseTag,
  parseTagType,
  printObject,
  printTag,
  printType,
} from 'agast';
import { buildSpanEntry } from '@bablr/agast-helpers/builders';

import {
  isEmpty,
  printSource,
  streamFromString,
  streamFromTree,
} from '@bablr/agast-helpers/stream';
import {
  continue_,
  getStreamIterator,
  StreamIterable,
  wait,
  arrayValues,
} from '@bablr/agast-helpers/iterable';
import { State } from './state.js';
import {
  OpenNodeTag,
  CloseNodeTag,
  GapTag,
  BindingTag,
  LiteralTag,
  ReferenceTag,
  ShiftTag,
  AttributeDefinitionTag,
} from '@bablr/agast-helpers/symbols';
import {
  treeFromStream,
  printSource as printTreeSource,
  getOpenTag,
} from '@bablr/agast-helpers/tree';
import * as Tags from '@bablr/agast-helpers/tags';

import { getEmbeddedTag } from '@bablr/agast-vm-helpers/deembed';
import { Match } from './match.js';
import { buildRegexMatcherTag, buildStringMatcherTag } from '@bablr/agast-vm-helpers/builders';
import { freeze, has, isFrozen, isString } from '@bablr/agast-helpers/object';
import { effectsFor, isShiftVerb, reifyBablrOptions, shouldBranch } from '@bablr/agast-vm-helpers';
import * as BList from '@bablr/agast-helpers/b-list';
import * as BListKeyed from '@bablr/agast-helpers/b-list-keyed';
import { defaultRegexFlags, writePattern } from '@bablr/helpers/builders';
import { freezeRecord } from '@bablr/record';
import { parseRegexPattern } from '@bablr/agast-vm-helpers/parsers/regex';
import { nodeIsComplete } from '@bablr/agast-helpers/path';

let porcelain = freezeRecord({ porcelain: true });

let getNodeAttributes = (node) => {
  return parseTag(node[0]).value.attributes;
};

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

  return buildRegexMatcherTag(
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
      i += parseLiteralTag(tag).value.value.length;
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

  let getState = () => s.getPublic();
  let rootSpans = options.spans || BListKeyed.fromValues([buildSpanEntry('Bare')]);
  let matchIsShift = false;

  s = State.from(rootSource, ctx, rootLanguage, rootSpans);

  s.source.advance();

  let iter = getStreamIterator(strategy);
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
      // if (!s.heldProperty) throw new Error();

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
          yield `<0-2>`;
          yield* streamFromString(text);
          yield `<0-1>`;
        }
        break;
      }

      case 'match': {
        let { arguments: { 0: pattern } = [] } = instr;

        let result = yield* s.guardedMatch(pattern);

        let node = result && treeFromStream(result);

        finishedMatch = null;

        returnValue = node;
        break;
      }

      case 'advance': {
        const { arguments: { 0: embeddedTag } = [] } = instr;

        if (!isString(embeddedTag.value)) throw new Error();

        const tag = parseTag(getEmbeddedTag(embeddedTag));
        const tag_ = printTag(tag, porcelain);

        switch (tag.type) {
          case ReferenceTag: {
            // if (m.didShift) throw new Error();

            s.advance(embeddedTag.value, s);
            break;
          }

          case ShiftTag: {
            // s.advance(embeddedTag.value, s);

            // s.holding = BList.push(
            //   // finishedMatch.depth?
            //   freeze({ matchDepth: m.depth, node: finishedMatch.node }),
            //   s.holding,
            // );

            s.advance(s.heldShift);

            matchIsShift = true;

            if (finishedMatch.didShift) {
              // m.resultPath = m.resultPath.removeAt(-1);
            }

            break;
          }

          case BindingTag: {
            s.advance(embeddedTag.value, s);
            break;
          }

          case OpenNodeTag: {
            let { flags, type, literalValue, selfClosing } = tag.value;

            s.depths.path++;

            if (flags.shift) {
              throw new Error();
            } else if (selfClosing) {
              if (literalValue) {
                if (literalValue.type !== LiteralTag) throw new Error('not implemented');
                let result = yield* s.guardedMatch(buildStringMatcherTag(literalValue.value.value));

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

              if (type === Symbol.for('__')) throw new Error();

              s.advance(embeddedTag.value, s);

              s.depths.path--;
            } else {
              s.advance(embeddedTag.value, s);
            }

            break;
          }

          case CloseNodeTag: {
            let { node } = s;

            let openTag = parseTag(getOpenTag(s.node));

            s.depths.path--;

            if (s.heldProperty && parseTag(s.heldProperty[0]).value.type !== '#') {
              throw new Error();
            }

            if (m.isShift && nodeIsComplete(m.node)) {
              m.doneShifting = true;
            } else {
              s.advance(embeddedTag.value, s);
            }

            if (!m.parent) {
              if (!s.source.done) {
                throw new Error('Parser failed to consume input');
              }

              if (BListKeyed.getSize(s.spans) !== BListKeyed.getSize(rootSpans)) {
                throw new Error('Parser did not close all spans');
              }
            }

            break;
          }

          case LiteralTag: {
            let pattern = tag.value.value;

            if (s.heldProperty) throw new Error('cannot advance literal while holding');

            let result = yield* s.guardedMatch(buildStringMatcherTag(pattern));

            if (result) {
              let sourceStep = s.source.advance(getSourceLength(result));

              while (sourceStep === null || sourceStep instanceof Promise) {
                if (sourceStep === null) yield continue_(), (sourceStep = iter.next());
                if (sourceStep instanceof Promise) sourceStep = yield wait(sourceStep);
              }

              s.advance(embeddedTag.value, s);
            } else {
              throw new Error('Failed to advance literal');
            }
            break;
          }

          case GapTag: {
            // if (BList.getSize(s.holding) > 1) throw new Error();

            if (s.heldShift) {
              let { heldShift } = s;

              s.heldShift = null;

              // TODO get bindings correct!
              s.advance(heldShift[4]);

              break;
            } else if (s.heldProperty) {
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

            s.advance(embeddedTag.value, s);

            break;
          }

          case AttributeDefinitionTag: {
            const { path, value } = tag.value;

            if (!m.options.escape && !has(parseTag(m.node[0]).value.attributes, path)) {
              throw new Error('undefined attributes must be declared');
            }

            if (s.heldShift) throw new Error('invalid place for an attribute binding');

            if (value && typeof value === 'object') throw new Error('unimplemented');

            s.advance(embeddedTag.value);

            break;
          }

          default:
            s.advance(embeddedTag.value);
        }

        yield tag_;

        // if (!m.resultPath) throw new Error();

        if (tag.type === OpenNodeTag) {
          s.depths.result++;
        } else if (tag.type === CloseNodeTag) {
          s.depths.result--;
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

      case 'holdShift': {
        if (m.node || m.isShift) throw new Error();

        if (s.heldShift) {
          throw new Error();
        }

        s.heldShift = '';

        yield `<^>`;

        m.isShift = true;
        break;
      }

      case 'holdTrivia': {
        // TODO BList.push should handle null as the empty list

        if (s.heldTrivia) throw new Error();

        s.heldTrivia = '';
        break;
      }

      case 'eatHeld': {
        if (!s.heldProperty) throw new Error();

        if (m.isShift && !m.doneShifting) throw new Error();

        let { heldProperty } = s;

        s.heldProperty = null;

        if (s.heldShift) {
          if (!heldProperty) throw new Error();
          s.advance(Tags.fromValues(['<//>']));

          yield '</>';
        } else {
          let tag_ = heldProperty;

          if (finishedMatch?.options.escape) {
            tag_ = Tags.getAt(-2, heldProperty);
            tag_ = printTag(
              buildEscapeTag(printTreeSource(heldProperty), getNodeAttributes(tag_[4]).cooked),
            );
          }
          s.advance(tag_);
        }

        break;
      }

      case 'pinHeld': {
        if (!s.heldProperty) throw new Error();

        let holding = BList.getAt(-1, s.holding);

        s.holding = BList.replaceAt(
          -1,
          freeze({ matchDepth: m.depth, property: holding.property }),
          s.holding,
        );

        yield* m.emit();

        break;
      }

      case 'dropHeld': {
        if (!s.heldProperty) throw new Error();

        let { getGapNode } = ctx;
        let empty = isEmpty(streamFromTree(s.heldProperty[4], { getGapNode }));

        if (!empty) throw new Error();

        s.heldProperty = null;

        break;
      }

      case 'branch': {
        s = s.branch();

        returnValue = s;
        break;
      }

      case 'accept': {
        s = s.accept();

        returnValue = s;
        break;
      }

      case 'reject': {
        s = s.reject();

        returnValue = s;
        break;
      }

      case 'call': {
        let { arguments: { 0: matcher, 1: options = '     ' } = [] } = instr;

        let { nodeMatcher } = matcher.value;
        let { literalValue: literalMatcher } = nodeMatcher.value;

        if (literalMatcher) throw new Error();

        m = Match.startFrame(
          ctx,
          s,
          m,
          finishedMatch?.isShift ? finishedMatch : null,
          matcher,
          reifyBablrOptions(options),
        );
        s = m ? m.state : s;

        if (matchIsShift) {
          m.isShift = true;
        }

        if (s.heldShift !== null) {
          m.heldShift = s.heldShift;
        }

        matchIsShift = false;

        if (s.heldTrivia !== null) {
          m.heldTrivia = s.heldTrivia;
          s.heldTrivia = null;
        }

        returnValue = m.getPublic();
        break;
      }

      case 'return': {
        finishedMatch = m;

        s.advance('</>');

        s.heldShift = m.heldShift;

        m = m.return();
        s = m ? m.state : s;

        if (finishedMatch.isNode || finishedMatch.isCover) {
          ctx.registerNode(finishedMatch.language, s.finishedNode);
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
          s = m.state;
        }

        returnValue = m && m.getPublic();
        break;
      }

      case 'getState': {
        returnValue = s.getPublic();
        break;
      }

      case 'getContext': {
        returnValue = ctx.getPublic();
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
