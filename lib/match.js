import { resolveLanguage } from '@bablr/helpers/grammar';
import { WeakStackFrame } from '@bablr/weak-stack';

import { agast, TagPathFacade as TagPath, PathFacade as Path, NodeFacade } from '@bablr/agast-vm';
import {
  buildBindingTag,
  buildCloseNodeTag,
  buildOpenNodeTag,
  buildReference,
  buildReferenceTag,
  getFlagsWithGap,
  mergeReferences,
  multiFragmentFlags,
} from '@bablr/agast-helpers/tree';
import { effectsFor } from '@bablr/agast-vm-helpers';

import { facades, actuals } from './facades.js';
import {
  CloseNodeTag,
  OpenNodeTag,
  ReferenceTag,
  AttributeDefinition,
  PropertyWrapper,
  BindingTag,
  InitializerTag,
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

  get fragment() {
    return actuals.get(this).fragment;
  }

  get pathDepth() {
    return actuals.get(this).depths.path;
  }

  get pathName() {
    return actuals.get(this).pathName;
  }

  get node() {
    return actuals.get(this).node;
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

  get nodeMatch() {
    return facades.get(actuals.get(this).nodeMatch);
  }

  get cover() {
    return facades.get(actuals.get(this).cover);
  }

  get shiftMatch() {
    return facades.get(actuals.get(this).coveredBoundary.shiftMatch);
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

    this.agast = null;
    this.cover = null;
    this.running = null;
    this.options = options;

    let isNode = !matcher.nodeMatcher.flags.fragment;
    let isCover = matcher.nodeMatcher.flags.cover;

    this.nodeMatch = isNode || !parent ? this : parent.nodeMatch;
    this.agast = null;
    this.cover = !parent?.isNode && parent?.cover ? parent.cover : isCover && parent ? this : null;
    this.rootNode = null;
    this.nodeDepth = (parent?.nodeDepth ?? 0) + (isNode ? 1 : 0);

    let held = null;
    if (this.coveredBoundary.shiftMatch) {
      ({ held } = state);
    }
    this.agast = agast({ held });

    let parentHasGap = !this.parent
      ? this.matcher.flags.hasGap
      : this.parent.nodeMatch.node.flags.hasGap;

    this.agast.vm.next(
      buildOpenNodeTag(parentHasGap ? getFlagsWithGap(multiFragmentFlags) : multiFragmentFlags),
    );
    if (!this.parent) {
      this.agast.vm.next(buildReferenceTag('_'));
      this.agast.vm.next(buildBindingTag());
    }
    this.rootNode = this.agast.state.node;

    new MatchFacade(this);
  }

  static from(context, language, state, matcher, props, options) {
    return Match.create(context, language, state, matcher, effectsFor('eat'), props, options);
  }

  get isCoverBoundary() {
    let { cover } = this;
    return cover === this;
  }

  get matcher() {
    return this.propertyMatcher?.nodeMatcher;
  }

  get node() {
    let { rootNode } = this;
    if (rootNode.tags.size <= 1) return null;

    let { property, tags } = rootNode.tags.at(1).value;

    if (tags[1]?.type === InitializerTag && rootNode.tags.size >= 2) {
      ({ property, tags } = rootNode.tags.at(2).value);
    }

    return property.node && new NodeFacade(property.node);
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
    let { agast } = this;

    return agast.state.path || agast.state.resultPath?.path;
  }

  get coveredBoundary() {
    return this.cover || this;
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

  get allowEmpty() {
    return !!this.grammar.emptyables?.has(this.type) || this.options.allowEmpty;
  }

  get fragmentNode() {
    throw new Error('not implemented');
  }

  get fragmentPath() {
    throw new Error('not implemented');
  }

  get didShift() {
    return !!this.shiftMatch;
  }

  get isNode() {
    let { flags } = this.matcher;
    return !this.parent || !flags.fragment;
  }

  get isCover() {
    return this.propertyMatcher.nodeMatcher.flags.cover;
  }

  advance(tag) {
    let { vm, state: agastState } = this.agast;
    let s = this.state;

    let result = vm.next(tag);

    if (tag.type === OpenNodeTag) {
      s.depths.result++;
    } else if (tag.type === CloseNodeTag) {
      s.depths.result--;
    }

    s.resultPath =
      (agastState.path || agastState.resultPath?.path) &&
      TagPath.from(
        agastState.path || agastState.resultPath?.path,
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

    this.agast.vm.next(buildCloseNodeTag());

    if (!m) return m;

    m.running = null;

    return m;
  }

  throw_() {
    const finishedMatch = this;
    const m = finishedMatch.parent;

    if (!m) return m;

    m.running = null;

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
          tagPath.propertyWrapper?.tag.value.property.reference.flags.expression;

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

        if (
          (tagPath.tag.type === CloseNodeTag ||
            (tagPath.tag.type === OpenNodeTag && tagPath.tag.value.selfClosing)) &&
          !tagPath.next
        ) {
          tagPath = m.parent
            ? TagPath.from(m.fragmentPath || fixme, mrangeInitial.tagsIndex + 1, 0)
            : null;

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
          tagPath = TagPath.from(m.path, 0);
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
