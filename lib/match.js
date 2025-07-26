import { resolveLanguage } from '@bablr/helpers/grammar';
import { WeakStackFrame } from '@bablr/weak-stack';

import { agast, TagPathFacade as TagPath, PathFacade as Path } from '@bablr/agast-vm';
import {
  buildOpenNodeTag,
  buildProperty,
  buildReference,
  fragmentFlags,
  mergeReferences,
} from '@bablr/agast-helpers/tree';
import { effectsFor } from '@bablr/agast-vm-helpers';
import { FragmentFacade } from './node.js';

import { facades, actuals } from './facades.js';
import {
  CloseNodeTag,
  OpenNodeTag,
  ReferenceTag,
  ShiftTag,
  AttributeDefinition,
  Property,
  PropertyWrapper,
  InitializerTag,
  BindingTag,
  LiteralTag,
} from '@bablr/agast-helpers/symbols';
import { offsetForTag } from '@bablr/agast-helpers/path';

export class MatchFacade {
  constructor(match) {
    facades.set(match, this);
    Object.freeze(this);
  }

  get language() {
    return actuals.get(this).language;
  }

  get matcher() {
    return actuals.get(this).matcher;
  }

  get options() {
    return actuals.get(this).options;
  }

  get mergedReference() {
    return actuals.get(this).mergedReference;
  }

  get propertyMatcher() {
    return actuals.get(this).propertyMatcher;
  }

  get depth() {
    return actuals.get(this).depth;
  }

  get path() {
    return actuals.get(this).path;
  }

  get inner() {
    return actuals.get(this).inner;
  }

  get fragment() {
    const {
      ctx,
      effects,
      path,
      isCoverBoundary,
      isNode,
      fragmentNode,
      node,
      mergedReference,
      rangePreviousIndex,
      rangeFinalIndex,
    } = actuals.get(this);

    const { name, isArray } = mergedReference;

    let prev =
      rangePreviousIndex != null
        ? (fragmentNode || node).tags.at(rangePreviousIndex)
        : rangePreviousIndex;

    let offset = [ReferenceTag, ShiftTag].includes(prev?.type) ? 0 : 1;

    if ((isNode || isCoverBoundary) && name) {
      return new FragmentFacade(
        effects.success !== 'none' ? fragmentNode : null,
        ctx,
        false,
        true,
        [rangePreviousIndex + offset, rangeFinalIndex],
        mergedReference,
        isArray ? fragmentNode.getChildPropertyIndex(rangePreviousIndex + offset) : null,
      );
    } else {
      return new FragmentFacade(fragmentNode || path.node, ctx, false, true, [
        rangePreviousIndex + offset,
        rangeFinalIndex,
      ]);
    }
  }

  get pathDepth() {
    return actuals.get(this).depths.path;
  }

  get pathName() {
    return actuals.get(this).pathName;
  }

  get pathParent() {
    return actuals.get(this).pathParent;
  }

  get node() {
    const { node, ctx } = actuals.get(this);
    return FragmentFacade.wrap(node, ctx, false);
  }

  get props() {
    return actuals.get(this).props;
  }

  get type() {
    return actuals.get(this).type;
  }

  get isNode() {
    return actuals.get(this).isNode;
  }

  get isCover() {
    return actuals.get(this).isCover;
  }

  get allowEmpty() {
    return actuals.get(this).allowEmpty;
  }

  get didShift() {
    return actuals.get(this).didShift;
  }

  get isCoverBoundary() {
    return actuals.get(this).isCoverBoundary;
  }

  get coveredBoundary() {
    return facades.get(actuals.get(this).coveredBoundary);
  }

  get cover() {
    return facades.get(actuals.get(this).cover);
  }

  get shiftMatch() {
    return facades.get(actuals.get(this).coveredBoundary.shiftMatch);
  }

  get captured() {
    return actuals.get(this).captured;
  }

  get range() {
    let { range } = actuals.get(this);
    return range && [range[0], range[1]];
  }

  get effects() {
    return actuals.get(this).effects;
  }

  get parent() {
    return facades.get(actuals.get(this).parent);
  }

  get grammar() {
    return actuals.get(this).grammar;
  }

  get state() {
    return facades.get(actuals.get(this).state);
  }

  get s() {
    return facades.get(actuals.get(this).s);
  }

  get rangePrevious() {
    return actuals.get(this).rangePrevious;
  }

  get rangePreviousIndex() {
    return actuals.get(this).rangePreviousIndex;
  }

  get rangeInitial() {
    return actuals.get(this).rangeInitial;
  }

  get rangeFinal() {
    return actuals.get(this).rangeFinal;
  }

  get rangeFinalIndex() {
    return actuals.get(this).rangeFinalIndex;
  }

  get mergedLanguagePath() {
    return actuals.get(this).mergedLanguagePath;
  }

  ancestors(...args) {
    return actuals.get(this).ancestors(...args);
  }
}

export class Match extends WeakStackFrame {
  constructor(parent, context, language, state, matcher, effects, shiftMatch = null, options = {}) {
    if (!context || !language || !state) {
      throw new Error('Invalid arguments to Match constructor');
    }

    super(parent);

    this.context = context;
    this.language = language;
    this.state = state;
    this.propertyMatcher = matcher;
    this.effects = effects;
    this.shiftMatch = shiftMatch;

    this.rangePreviousIndex = null;
    this.rangeFinalIndex = null;
    this.agast = null;
    this.agastFragment = null; // why do it this way?
    this.node = null;
    this.cover = null;
    this.running = null;
    this.options = options;

    let isNode = !matcher.nodeMatcher.flags.fragment;
    let isCover = matcher.nodeMatcher.flags.cover;

    this.agast = isNode ? null : state.agast ?? null;
    this.node = isNode ? null : parent?.node;
    this.cover =
      isNode || effects.success === 'none' ? null : parent?.cover || (isCover ? this : null);

    let isCoverBoundary = ((isNode || isCover) && !this.cover) || !parent;

    if (isCoverBoundary) {
      let held = null;
      // TODO wat
      if (this.coveredBoundary.shiftMatch) {
        let { reference, binding, node } = state.held;
        held = buildProperty(reference, binding, node.node);
      }
      this.agast = agast({ held });
    } else {
      this.agast = parent.agast;
      if (effects.success === 'none') {
        this.agast = agast();
        this.agast.vm.next(buildOpenNodeTag(fragmentFlags));
      }
    }

    new MatchFacade(this);
  }

  static from(context, language, state, matcher, props, options) {
    return Match.create(context, language, state, matcher, effectsFor('eat'), props, options);
  }

  get isCoverBoundary() {
    return (this.isNode && this.parent && !this.parent.cover) || this.cover === this;
  }

  get matcher() {
    return this.propertyMatcher?.nodeMatcher;
  }

  get vm() {
    return this.agast.vm;
  }

  get mergedReference() {
    let ref = buildReference('.');

    let first = true;
    let m = this;
    let lastName = null;
    let lastRefType = null;
    do {
      if (m.isNode && !first) break;
      if (m.propertyMatcher.refMatcher) {
        const parentRef = m.propertyMatcher.refMatcher;
        const { type: refType, name } = parentRef;

        if (lastName && (lastName !== name || lastRefType !== refType)) break;
        ref = ['#', '@'].includes(ref.type) ? ref : mergeReferences(ref, parentRef);
        if (refType !== '.') {
          lastName = name;
          lastRefType = refType;
        }
      }
      first = false;
    } while ((m = m.shiftMatch || m.parent));

    return ref;
  }

  get mergedLanguagePath() {
    let languagePath = [];

    let first = true;
    let m = this;
    do {
      if (m.isNode && !first) break;
      if (m.propertyMatcher.bindingMatcher) {
        languagePath = m.propertyMatcher.bindingMatcher.languagePath.concat(languagePath);
      }
      first = false;
    } while ((m = m.shiftMatch || m.parent));

    return Object.freeze(languagePath);
  }

  get pathName() {
    return this.mergedReference.name;
  }

  get path() {
    let { agast } = this.coveredBoundary.parent ?? this;

    return agast.state.path || agast.state.resultPath?.path;
  }

  get pathParent() {
    let m = this;

    do {
      m = m.parent;
    } while (m && !m.isNode);
    return m;
  }

  get coveredBoundary() {
    return this.isNode ? this.parent?.cover || this : this.cover || this;
  }

  get parentPath() {
    return this.pathParent?.path;
  }

  get ctx() {
    return this.context;
  }

  get grammar() {
    return this.context.grammars.get(this.language);
  }

  get s() {
    return this.state;
  }

  get type() {
    return this.matcher?.type || null;
  }

  get flags() {
    return this.matcher?.flags;
  }

  get captured() {
    return !this.rangePrevious || !!this.rangeFinal;
  }

  get allowEmpty() {
    return !!this.grammar.emptyables?.has(this.type) || this.options.allowEmpty;
  }

  get fragmentNode() {
    if (!this.agastFragment) return null;

    let { node, resultPath } = this.agastFragment.state;
    return resultPath?.tag.type === CloseNodeTag ? resultPath.node : node;
  }

  get rangePrevious() {
    let node = this.fragmentNode || this.node;

    return this.rangePreviousIndex == null || node == null
      ? null
      : TagPath.fromNode(node, this.rangePreviousIndex, -1); //TODO is -1 right?
  }

  setRangePreviousIndex(value) {
    if ((value != null && !Number.isFinite(value)) || value < 0) throw new Error();
    this.rangePreviousIndex = value;
    if (
      value != null &&
      (!this.rangePrevious ||
        (this.isNode &&
          ![
            OpenNodeTag,
            Property,
            PropertyWrapper,
            InitializerTag,
            LiteralTag,
            AttributeDefinition,
          ].includes(this.rangePrevious.tag.type)))
    )
      throw new Error();
  }

  setRangeFinalIndex(value) {
    if (value != null && !Number.isFinite(value)) throw new Error();
    this.rangeFinalIndex = value;
    this.rangeFinal;
  }

  get rangeFinal() {
    let node = this.fragmentNode || this.node;

    return this.rangeFinalIndex == null || node == null
      ? null
      : TagPath.fromNode(node, this.rangeFinalIndex, -1);
  }

  get rangeInitial() {
    const { rangePrevious, isNode, fragmentNode, node, rangePreviousIndex } = this;

    if (!rangePrevious) return rangePrevious;

    if (isNode) return TagPath.fromNode(fragmentNode || node, rangePreviousIndex + 1, 0);

    return rangePrevious?.nextSibling;
  }

  get range() {
    const { rangeInitial, rangeFinal } = this;
    return rangeInitial === null ? null : [rangeInitial, rangeFinal];
  }

  get didShift() {
    return !!this.shiftMatch;
  }

  get referencePath() {
    if (!(this.isNode || this.isCoverBoundary || this.cover) || this.state.depths.path < 0) {
      return null;
    }

    let offset = this.isNode ? 1 : 0;

    let ref = TagPath.fromNode(this.fragmentNode || this.node, this.rangePreviousIndex + offset, 0);

    if (!ref) return null;

    if (ref.tag.type === ShiftTag) {
      throw new Error('not implemented');
      let refIndex = ref.tagsIndex - ref.tag.value.index * 3;
      ref = ref.siblingAt(refIndex);
    }

    if (ref && ref.tag.type !== ReferenceTag) throw new Error();
    return ref;
  }

  get isNode() {
    let { flags } = this.matcher;
    return !this.parent || !flags.fragment;
  }

  get isCover() {
    return this.cover === this;
  }

  get inner() {
    return Path.from(this.node);
  }

  advance(tag, s = this.state) {
    let { vm, state: agastState } = s.agast;

    let result = vm.next(tag);

    if (tag.type === OpenNodeTag) {
      s.depths.result++;
      this.node = s.node;
    } else if (tag.type === CloseNodeTag) {
      s.depths.result--;
    }

    s.resultPath =
      (agastState.node || agastState.resultPath?.node) &&
      TagPath.fromNode(
        agastState.node || agastState.resultPath?.node,
        -1,
        tag.type === PropertyWrapper ? -1 : offsetForTag(tag),
      );
    return result.value;
  }

  startFrame(state, propertyMatcher, effects, shiftMatch, options) {
    let { context } = this;
    const { bindingMatcher } = propertyMatcher;

    let language = shiftMatch?.language ?? this.language;

    if (bindingMatcher) {
      language = resolveLanguage(context, language, bindingMatcher.languagePath);

      if (!language) {
        throw new Error(`Unknown language ${bindingMatcher.languagePath.join('.')}`);
      }
    }

    let m = this.push(context, language, state, propertyMatcher, effects, shiftMatch, options);

    this.running = m;

    return m;
  }

  endFrame() {
    const finishedMatch = this;
    const m = finishedMatch.parent;

    if (!m) return m;

    finishedMatch.setRangeFinalIndex((finishedMatch.fragmentNode || m.node).tags.size - 1);

    m.running = null;

    return m;
  }

  throw_() {
    const finishedMatch = this;
    const m = finishedMatch.parent;

    if (!m) return m;

    m.running = null;

    finishedMatch.setRangePreviousIndex(null);

    return m;
  }

  *emit(options) {
    let { state } = this;
    let { emitted } = state;

    let m = emitted?.match ?? this;

    if (!state.depth) {
      let { node } = m;

      // if (!node) {
      //   node = resultPath.node;
      // }

      let path = Path.from(node);

      let tagPath = emitted?.tagPath || (path.node.tags.size ? TagPath.from(path, 0) : null);

      while (tagPath) {
        if (
          options.holdUndefinedAttributes &&
          tagPath.tag.type === OpenNodeTag &&
          tagPath.tag.value.type &&
          (m.node.undefinedAttributes ?? 0) > 0
        ) {
          break;
        }

        if (
          tagPath.tag.type === OpenNodeTag &&
          m.referencePath?.tag.value.type === '@' &&
          tagPath.node.flags.hasGap
        )
          break;

        let holdShifted =
          options.holdShiftedNodes &&
          tagPath.tag.type === ReferenceTag &&
          tagPath.tag.value.flags.expression;

        if (!state.emitted || !tagPath.equalTo(state.emitted.tagPath)) {
          state.emitted = emitted = { match: m, tagPath };

          if (tagPath.tag.type === OpenNodeTag) {
            state.depths.emitted++;
          } else if (tagPath.tag.type === CloseNodeTag) {
            state.depths.emitted--;
          }

          if (
            !(
              (tagPath.tag.type === BindingTag && !tagPath.tag.value.languagePath?.length) ||
              (tagPath.tag.type === AttributeDefinition && options.holdUndefinedAttributes)
            )
          ) {
            yield tagPath.tag;
          }
        }

        if (tagPath.tag.type === CloseNodeTag && !tagPath.next) {
          tagPath = TagPath.fromNode(m.fragmentNode, m.rangeInitial.tagsIndex + 1, 0);

          do {
            m = m.parent;
          } while (m && !m.isNode);

          if (!m) break;

          continue;
        }

        if (!holdShifted && tagPath.tag.type === ReferenceTag && !tagPath.nextSibling) {
          let { running } = m;

          while (running && !running.isNode) {
            if (running.state.depth > 0) {
              running = null;
              break;
            } else {
              running = running.running;
            }
          }

          if (running) {
            m = running;
          } else {
            break;
          }
          tagPath = TagPath.fromNode(m.node, 0);
        } else {
          if (holdShifted) {
            tagPath = tagPath.nextUnshifted;
          } else {
            tagPath = tagPath.next;
          }
        }
      }
    }
  }
}
