import { getProduction } from '@bablr/helpers/grammar';
import { WeakStackFrame } from '@bablr/weak-stack';

import { agast } from '@bablr/agast-vm';
import * as Tags from '@bablr/agast-helpers/tags';
import * as BTree from '@bablr/agast-helpers/btree';
import {
  buildReference,
  buildReferenceTag,
  getFlagsWithGap,
  mergeReferences,
  printBinding,
  printType,
  buildPropertyTag,
  buildOpenFragmentTag,
  nodeFlags,
} from '@bablr/agast-helpers/tree';
import { effectsFor, reifyExpression, shouldBranch } from '@bablr/agast-vm-helpers';

import { facades, actuals } from './facades.js';
import {
  CloseNodeTag,
  OpenNodeTag,
  AttributeDefinition,
  Property,
  ReferenceTag,
  BindingTag,
  GapTag,
  NullTag,
} from '@bablr/agast-helpers/symbols';
import {
  buildNullNode,
  endsNode,
  getTags,
  has,
  isMultiFragment,
  Path,
  TagPath,
} from '@bablr/agast-helpers/path';
import { updateSpans } from './spans.js';

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

  get rawPropertyMatcher() {
    return actuals.get(this).rawPropertyMatcher;
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
    return actuals.get(this).s.getPublic();
  }

  get s() {
    return actuals.get(this).s.getPublic();
  }

  ancestors(...args) {
    return actuals.get(this).ancestors(...args);
  }
}

const normalizeBindingPath = (path) => {
  if (path.length <= 1) return path;
};

export class Match extends WeakStackFrame {
  static startFrame(ctx, s, m, finishedMatch, verb, matcher, options) {
    let effects = effectsFor(verb.description);
    let isShift = verb.description.startsWith('shift'); // should this be didShift?

    let parentMatch = m;

    if (!s) throw new Error('not initialized');

    let matcher_ = reifyExpression(matcher);

    if (parentMatch && parentMatch.cover && !parentMatch.isNode) {
      if (matcher_.refMatcher) {
        let m = matcher_.refMatcher;
        if (!['_', '#'].includes(m.type) || m.flags.expression || m.flags.hasGap || m.isArray) {
          throw new Error('no references inside covers');
        }
      }
    }

    if (isShift && matcher_.nodeMatcher.type === '__') {
      throw new Error();
    }
    if (isShift && !parentMatch) throw new Error();

    if (shouldBranch(effects)) {
      s = s.branch();
    }

    s.languages = isShift
      ? finishedMatch.languages
      : parentMatch
      ? parentMatch.languages
      : s.languages;

    m = parentMatch
      ? parentMatch.startFrame(s, matcher, effects, isShift ? finishedMatch : null, options)
      : Match.from(ctx, s, matcher, null, options);

    updateSpans(m, 'open');

    if (m.name && !getProduction(m.grammar, m.name))
      throw new Error(`Production {type: ${printType(m.name)}} does not exist`);

    if (m.flags.token && !m.isNode) {
      throw new Error('tokens must be nodes');
    }

    finishedMatch = null;

    if (!m.parent && m.type === '__') {
      s.node = m.rootNode;
    }
    return m;
  }

  constructor(parent, context, state, rawMatcher, effects, shiftMatch = null, options = {}) {
    if (!context || !state) {
      throw new Error('Invalid arguments to Match constructor');
    }
    let matcher = reifyExpression(rawMatcher);

    super(parent);

    this.context = context;
    this.state = state;
    this.rawPropertyMatcher = rawMatcher;
    this.propertyMatcher = matcher;
    this.effects = effects;
    this.shiftMatch = shiftMatch;

    this.agast = null;
    this.cover = null;
    this.running = null;
    this.options = options;

    let isNode = !matcher.nodeMatcher.type;
    let isCover = matcher.nodeMatcher.type === '_';

    this.languages = state.languages;
    this.nodeMatch = isNode || !parent ? this : parent.nodeMatch;
    this.languageMatch =
      normalizeBindingPath(matcher.bindingMatchers).length || !parent ? this : parent.languageMatch;
    this.agast = null;
    this.cover =
      !parent?.isNode && parent?.cover && matcher.refMatcher?.type !== '#'
        ? parent.cover
        : isCover && parent
        ? this
        : null;
    this.rootNode = null;
    this.nodeDepth = (parent?.nodeDepth ?? 0) + (isNode ? 1 : 0);
    this.parentPreviousTagPath = this.parent && TagPath.from(this.parent.path, -1, -1);
    this.emitted = null;

    if (!this.language) {
      throw new Error(`Unknown language ${printBinding(matcher.bindingMatcher)}`);
    }

    let held = null;
    if (this.coveredBoundary.shiftMatch) {
      held = state.held;
    }
    this.agast = agast({ held });

    let parentHasGap = !this.parent
      ? this.matcher.flags.hasGap
      : this.parent.nodeMatch.node.value.flags.hasGap;

    this.agast.vm.next(buildOpenFragmentTag(parentHasGap ? getFlagsWithGap(nodeFlags) : nodeFlags));
    if (!this.parent) {
      if (isNode || isCover) {
        this.agast.vm.next(buildReferenceTag());
      }
    } else if (shiftMatch) {
      this.agast.vm.next(shiftMatch.rootNode);
      this.emitted = { match: this, tagPath: Path.from(this.agast.getState().node).tagPathAt(-1) };
    }
    this.rootNode = this.agast.getState().node;

    new MatchFacade(this);
  }

  static from(context, state, matcher, props, options) {
    return Match.create(context, state, matcher, effectsFor('eat'), props, options);
  }

  get language() {
    return BTree.getAt(-1, this.languages);
  }

  get isCoverBoundary() {
    let { cover, isNode } = this;
    return cover === this || (!cover && isNode);
  }

  get matcher() {
    return this.propertyMatcher?.nodeMatcher;
  }

  get node() {
    let { rootNode } = this;

    if (this.matcher.type === '__') {
      return rootNode;
    }
    if (Tags.getSize(getTags(rootNode)) <= 1) return null;

    return Tags.getAt(-1, rootNode.value.children).value.node;
  }

  get vm() {
    return this.agast.vm;
  }

  get mergedReference() {
    let ref = buildReference();

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
        if (refType !== '_') {
          lastName = name;
          lastRefType = refType;
        }
      }
      first = false;
    } while ((m = m.shiftMatch || m.parent));

    return ref;
  }

  get pathName() {
    return this.mergedReference.name;
  }

  get path() {
    let { agast } = this;

    return agast.getState().path || agast.getState().resultPath?.path;
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

  get name() {
    return this.matcher?.name || null;
  }

  get flags() {
    return this.matcher?.flags;
  }

  get allowEmpty() {
    return !!this.grammar.emptyables?.has(this.name) || this.options.allowEmpty;
  }

  get didShift() {
    return !!this.shiftMatch;
  }

  get isNode() {
    return !this.matcher.type;
  }

  get isCover() {
    return this.propertyMatcher.nodeMatcher.type === '_';
  }

  advance(tag) {
    let { vm, getState } = this.agast;
    let s = this.state;

    let result = vm.next(tag);

    if (!result || result.done) throw new Error();

    let agastState = getState();

    if (tag.type === OpenNodeTag) {
      s.depths.result++;
    } else if (tag.type === CloseNodeTag) {
      s.depths.result--;
    }

    this.rootNode = agastState.path.atDepth(0).node;

    s.resultPath = agastState.resultPath;

    // if (this.emitted?.tagPath.depth > 1) throw new Error();

    if (this.emitted?.match === this) {
      let emittedPath = this.emitted?.tagPath || null;

      let newEmitted = emittedPath && {
        match: this.emitted.match,
        tagPath: emittedPath.mapOnto(this.rootNode),
      };

      if (emittedPath) {
        if (!newEmitted.tagPath) throw new Error();
        // if (newEmitted.tagPath.tag.depth !== this.emitted.tagPath.tag.depth) throw new Error();
      }

      this.emitted = newEmitted;
    }

    return result.value;
  }

  startFrame(state, rawMatcher, effects, shiftMatch, options) {
    let { context } = this;

    let language = this.language;

    // TODO stop wasting CPU cycles doing this twice or more!
    let matcher = reifyExpression(rawMatcher);
    let { bindingMatchers } = matcher;

    for (let bindingMatcher of bindingMatchers) {
      let { segments } = bindingMatcher || { segments: [] };

      for (let segment of segments) {
        language = segment.type
          ? BTree.getAt(-2, state.languages)
          : language.dependencies[segment.name];
      }

      state.languages = BTree.push(state.languages, language);
    }

    let m = this.push(context, state, rawMatcher, effects, shiftMatch, options);

    this.running = m;

    return m;
  }

  endFrame() {
    const finishedMatch = this;
    const m = finishedMatch.parent;
    let s = finishedMatch.state;

    if (finishedMatch.shiftMatch) {
      s.held = null;
    }

    let matchers = finishedMatch.propertyMatcher.bindingMatchers || [];

    for (let matcher of matchers) {
      let { segments } = matcher;
      let normalizedSegments = normalizeBindingPath(segments);
      if (normalizedSegments.length) {
        finishedMatch.state.languages = BTree.pop(finishedMatch.state.languages);
      }
    }

    if (!m) return m;

    m.running = null;

    updateSpans(finishedMatch, 'close');

    if (shouldBranch(finishedMatch.effects)) {
      if (finishedMatch.effects.success !== 'none') {
        s = s.accept();
      } else {
        s = s.reject(finishedMatch);
      }
    }

    if (finishedMatch.effects.success !== 'none') {
      // for a shift, only copy the parts of the stack that aren't already present from the last successful shift frame

      if (finishedMatch.shiftMatch) {
        let property = Tags.getAt(-2, finishedMatch.rootNode.value.tags);
        s.node = property.value.node;
        m.advance(property.value.tags[0]);
        for (let bindingTag of property.value.tags[1]) {
          m.advance(bindingTag);
        }
        m.advance(property.value.node);
      } else {
        s.node = finishedMatch.rootNode;
        m.advance(s.node);
      }
    }

    if (m.emitted?.match === m && !finishedMatch.s.depth) {
      let { tagPath } = m.emitted;

      if (endsNode(tagPath.tag)) {
        tagPath = tagPath.path.parentPropertyPath;
      }

      m.emitted = {
        match: m,
        tagPath: isMultiFragment(finishedMatch.node)
          ? tagPath.siblingAt(tagPath.tagsIndex + Tags.getSize(finishedMatch.node.value.children))
          : tagPath.nextSibling
          ? tagPath.nextSibling.propertyPath
          : tagPath,
      };
    }

    return m;
  }

  throw_() {
    let { bind } = this.options;
    let finishedMatch = this;
    let m = finishedMatch.parent;
    let s = finishedMatch.state;

    if (!m) return m;

    m.running = null;

    // TODO don't do this if we're falling back to a successful shift either
    if (bind) {
      for (let tag of Tags.traverse(this.rootNode.value.children)) {
        if (tag.type === Property) {
          let { reference, shift, tags } = tag.value;

          if (
            !['#', '@'].includes(reference.type) &&
            !reference.isArray &&
            !has(reference.name, m.node) &&
            !shift
          ) {
            m.advance(buildPropertyTag([tags[0], [], buildNullNode()]));
          }
        }
      }
    }

    if (s.status === 'active') {
      s.reject(finishedMatch);
    }

    // restore successful parts of shift stack here

    // if (
    //   finishedMatch.isCoverBoundary &&
    //   finishedMatch.shiftMatch &&
    //   finishedMatch.effects.failure === 'none'
    // ) {
    //   m.advance(finishedMatch.shiftMatch.rootNode);

    //   s.node = finishedMatch.shiftMatch.node;
    // }

    m.state.resultPath = TagPath.fromNode(m.state.node, -1);

    return m;
  }

  *emit(options) {
    let { state, emitted } = this;

    let m = emitted?.match ?? this;

    if (!state.depth) {
      let node = m.node || m.rootNode;

      let parentEmittingThis =
        !!emitted ||
        !this.parent ||
        (this.parent.emitted?.match === this.parent && !this.parent.emitted.tagPath.nextSibling);

      let tagPath =
        emitted && emitted.match === this
          ? emitted.tagPath
          : Tags.getSize(getTags(node)) && parentEmittingThis
          ? TagPath.fromNode(m.rootNode, 0)
          : null;

      while (tagPath) {
        // if (
        //   options.holdUndefinedAttributes &&
        //   tagPath.tag.type === OpenNodeTag &&
        //   tagPath.tag.value.name
        //   && (countUndefinedAttributes(m.node) ?? 0) > 0
        // ) {
        //   break;
        // }

        if (
          tagPath.tag.type === OpenNodeTag &&
          m.referencePath?.tag.value.type === '@' &&
          tagPath.node.flags.hasGap
        )
          break;

        let holdingShifted =
          options.holdShiftedNodes && m.emitted?.match.mergedReference.flags.expression;
        // tagPath.path.referenceTagPath?.tag.value.flags.expression;

        if (holdingShifted && m.running) break;

        if (!m.emitted || !tagPath.equalTo(m.emitted.tagPath)) {
          m.emitted = emitted = { match: m, tagPath };

          if (tagPath.tag.type === OpenNodeTag && !tagPath.tag.value.selfClosing) {
            state.depths.emitted++;
          } else if (tagPath.tag.type === CloseNodeTag) {
            state.depths.emitted--;
          }

          if (
            tagPath.tag.type !== Property &&
            !(tagPath.tag.type === BindingTag && !tagPath.tag.value.segments?.length) &&
            !(tagPath.tag.type === AttributeDefinition && options.holdUndefinedAttributes) &&
            !(
              [OpenNodeTag, CloseNodeTag].includes(tagPath.tag.type) &&
              tagPath.depth === 0 &&
              isMultiFragment(tagPath.node) &&
              (m.depth || !(m.matcher.type === '__'))
            ) &&
            !(m.depth === 0 && tagPath.tag.type === ReferenceTag)
          ) {
            yield tagPath.tag;
          }
        }

        if (
          [CloseNodeTag, GapTag, NullTag].includes(tagPath.tag.type) ||
          (tagPath.tag.type === OpenNodeTag && tagPath.tag.value.selfClosing) ||
          (!holdingShifted && !tagPath.nextSibling && !tagPath.tag.type === Property)
        ) {
          let nextPath = tagPath.next;
          if (nextPath) {
            tagPath = nextPath;
            continue;
          }

          do {
            if (m.running) {
              m = m.running;
              tagPath = TagPath.fromNode(m.rootNode, 1, 0);
            } else if (m.parent && (!m.parent.running || m.parent.running !== m)) {
              // a multi-fragment inserts many properties into its parent
              // how many do we need to skip over?
              //   m.rootNode.value.children.size
              tagPath = m.parentPreviousTagPath;

              tagPath = TagPath.from(
                tagPath.path,
                tagPath.tagsIndex +
                  1 +
                  (m.matcher.flags.fragment && !m.matcher.flags.cover
                    ? Tags.getSize(m.rootNode.value.children)
                    : 1),
                0,
              );

              m = m.parent;
            } else {
              m = null;
              break;
            }
          } while (m && !tagPath);

          if (!m) break;

          continue;
        }

        tagPath =
          tagPath.tag.type === Property
            ? tagPath.path.tagPathAt(tagPath.tagsIndex + 1, 0)
            : holdingShifted
            ? tagPath.nextUnshifted
            : tagPath.next;
      }
    }
  }
}
