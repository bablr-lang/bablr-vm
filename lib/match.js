import { getProduction } from '@bablr/helpers/grammar';

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
  referenceFromMatcher,
} from '@bablr/agast-helpers/tree';
import { effectsFor, reifyExpression, shouldBranch } from '@bablr/agast-vm-helpers';

import { buildFacadeNode } from './facades.js';
import {
  CloseNodeTag,
  OpenNodeTag,
  AttributeDefinition,
  Property,
  ReferenceTag,
  BindingTag,
  ShiftTag,
  TreeNode,
} from '@bablr/agast-helpers/symbols';
import {
  buildNullNode,
  endsNode,
  getCloseTag,
  getTags,
  has,
  isMultiFragment,
  Path,
  TagPath,
} from '@bablr/agast-helpers/path';

let facades = new WeakMap();

const normalizeBindingPath = (path) => {
  if (path.length <= 1) return path;
};

export class Match {
  static startFrame(ctx, s, m, finishedMatch, verb, matcher, options) {
    let effects = effectsFor(verb.description);
    let isShift = verb.description.startsWith('shift'); // should this be didShift?

    let parentMatch = m;

    if (!s) throw new Error('not initialized');

    let matcher_ = reifyExpression(matcher);

    if (parentMatch && parentMatch.cover && !parentMatch.isNode) {
      if (matcher_.refMatcher) {
        let m = matcher_.refMatcher;
        if (!['_', '#'].includes(m.type) || m.flags.expression || m.flags.hasGap || m.flags.array) {
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

    this.parent = parent;
    this.context = context;
    this.state = state;
    this.rawPropertyMatcher = rawMatcher;
    this.propertyMatcher = matcher;
    this.effects = effects;
    this.shiftMatch = shiftMatch;
    this.emittedMatch = parent?.emittedMatch || this;

    this.depth = !parent ? 0 : parent.depth + 1;
    this.agast = null;
    this.cover = null;
    this.running = null;
    this.options = options;

    let isNode = !matcher.nodeMatcher.type;
    let isCover = matcher.nodeMatcher.type === '_';

    this.languages = state.languages;
    this.nodeMatch = isNode || !parent ? this : parent.nodeMatch;
    this.expressionMatch = shiftMatch
      ? shiftMatch.expressionMatch
      : parent?.expressionMatch || (matcher.refMatcher?.flags.expression ? this : null);
    this.languageMatch =
      normalizeBindingPath(matcher.bindingMatchers).length || !parent ? this : parent.languageMatch;
    this.holdingMatch = parent?.holdingMatch || (options.hold ? this : null);
    this.agast = null;
    this.cover =
      !shiftMatch && !parent?.isNode && parent?.cover && matcher.refMatcher?.type !== '#'
        ? parent.cover
        : isCover && parent
        ? this
        : null;
    this.rootNode = null;
    this.nodeDepth = (parent?.nodeDepth ?? 0) + (isNode ? 1 : 0);
    this.parentPreviousTagPath = this.parent && TagPath.from(this.parent.path, -1, -1);
    this.emitted = this.parent?.emitted || null;

    if (!this.language) {
      throw new Error(`Unknown language ${printBinding(matcher.bindingMatcher)}`);
    }

    let held = null;
    if (this.coveredBoundary.shiftMatch) {
      held = state.held?.value.node;
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
    }
    this.rootNode = this.agast.getState().node;
  }

  static from(context, state, matcher, props, options) {
    return new Match(null, context, state, matcher, effectsFor('eat'), props, options);
  }

  get language() {
    return BTree.getAt(-1, this.languages);
  }

  get emitting() {
    return this.emittedMatch === this;
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

    if (this.shiftMatch) return this.shiftMatch.mergedReference;

    let first = true;
    let m = this;
    let lastName = null;
    let lastRefType = null;
    do {
      if (m.isNode && !first) break;
      const parentRef =
        m.propertyMatcher.refMatcher || buildReference(m.cover && !m.isCoverBoundary ? '_' : '.');
      const { type: refType, name } = parentRef;

      if (!refType && !name) if (lastName && (lastName !== name || lastRefType !== refType)) break;
      if (lastRefType === '.' && name) break;
      ref = ['#', '@'].includes(ref.type) ? ref : mergeReferences(parentRef, ref);
      if (refType !== '_') {
        lastName = name;
        lastRefType = refType;
      }
      first = false;
    } while ((m = m.parent));

    return ref;
  }

  get pathName() {
    return this.mergedReference.name;
  }

  get path() {
    let { agast } = this;

    return Path.wrap(agast.getState().path || agast.getState().resultPath?.path);
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

  push(context, state, rawMatcher, effects, shiftMatch, options) {
    return new Match(this, context, state, rawMatcher, effects, shiftMatch, options);
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

    this.rootNode = Path.wrap(agastState.path).atDepth(0).node;

    s.resultPath = TagPath.wrap(agastState.resultPath);

    // if (this.emitted?.depth > 1) throw new Error();

    if (this.emittedMatch === this) {
      let emittedPath = this.emitted || null;

      let newEmitted = emittedPath && emittedPath.mapOnto(this.rootNode);

      if (emittedPath) {
        if (!newEmitted) throw new Error();
        // if (newEmitted.tag.depth !== this.emitted.tag.depth) throw new Error();
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

    if (finishedMatch.shiftMatch && s.shifted) {
      s.holding = BTree.pop(s.holding);
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

    if (shouldBranch(finishedMatch.effects)) {
      if (finishedMatch.effects.success !== 'none') {
        s = s.accept();
      } else {
        s = s.reject(finishedMatch);
      }
    }

    m.emitted = finishedMatch.emitted;
    m.emittedMatch = finishedMatch.emittedMatch;

    if (finishedMatch.effects.success !== 'none') {
      let property = Tags.getAt(-2, finishedMatch.rootNode.value.tags);
      if (finishedMatch.options.hold) {
        if (!finishedMatch.isNode) throw new Error();
        s.holding = BTree.push(s.holding, property);
      } else {
        s.node = finishedMatch.shiftMatch ? property.value.node : finishedMatch.rootNode;
        m.advance(finishedMatch.shiftMatch ? property : finishedMatch.rootNode);
      }
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
            !reference.flags.array &&
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
    let { state, emitted, emittedMatch } = this;

    let m = emittedMatch;

    if (!state.depth) {
      let node = m.node || m.rootNode;

      let tagPath = emitted
        ? emitted
        : Tags.getSize(getTags(node))
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

        if (this.holdingMatch) break;

        if (
          tagPath.tag.type === OpenNodeTag &&
          m.referencePath?.tag.value.type === '@' &&
          tagPath.node.flags.hasGap
        )
          break;

        let holdingShifted =
          options.holdShiftedNodes &&
          tagPath.tag.type === ReferenceTag &&
          tagPath.tag.value.flags.expression &&
          tagPath.depth <= 1;

        if (holdingShifted) {
          if (!tagPath.equalTo(m.emitted)) {
            m.emitted = emitted = tagPath;
            this.emittedMatch = m;

            yield tagPath.tag;
          }

          if (
            m.expressionMatch &&
            (m.expressionMatch.running || !getCloseTag(m.expressionMatch.rootNode))
          ) {
            break;
          } else {
            let { parentPreviousTagPath } = m;
            let nextTag =
              parentPreviousTagPath &&
              Tags.getAt(parentPreviousTagPath.tagsIndex + 2, m.parent.node.value.tags);

            let doneShifting = !(nextTag?.type === Property && nextTag.value.shift);

            // todo monomorph
            let shiftIndex = nextTag?.type === Property ? nextTag?.value.shift?.index ?? 0 : 0;
            while (!doneShifting && nextTag) {
              nextTag =
                Tags.getAt(
                  [parentPreviousTagPath.tagsIndex + 2 + shiftIndex, 1],
                  m.parent.node.value.tags,
                ) ||
                Tags.getAt(
                  parentPreviousTagPath.tagsIndex + 2 + shiftIndex,
                  m.parent.node.value.tags,
                );
              doneShifting = nextTag && !(nextTag.type === Property && nextTag.value.shift);
              if (!doneShifting) {
                shiftIndex++;
              }
            }

            if ((parentPreviousTagPath && !nextTag) || !doneShifting) {
              break;
            } else {
              if (m.parent.rootNode) {
                if (shiftIndex) {
                  m = m.parent;
                  tagPath = Path.from(m.rootNode)
                    .tagPathAt(1)
                    .inner.tagPathAt(1 + shiftIndex, 0).nextSibling;
                  if (tagPath?.tag.type === TreeNode) {
                    tagPath = tagPath.inner.tagPathAt(0);
                  }
                }
              }

              if (!tagPath) break;
            }
          }
        }

        if (tagPath.depth === 0 && endsNode(tagPath.tag)) {
          let finishedMatch = m;
          m = m.parent;

          let parentRoot = Path.from(m.rootNode);

          if (m.type !== '__') {
            parentRoot = parentRoot.tagPathAt(getCloseTag(m.rootNode) ? -2 : -1).inner;
          }

          let finishedChildren = Tags.getSize(finishedMatch.rootNode.value.children);

          let parentNextTagPath = parentRoot?.tagPathAt(
            finishedMatch.parentPreviousTagPath.tagsIndex + finishedChildren + 1,
          );

          tagPath = parentNextTagPath;

          if (!tagPath) {
            if (m.running) {
              m = m.running;

              let shiftIndex =
                finishedMatch.parentPreviousTagPath.tag.type === Property &&
                finishedMatch.parentPreviousTagPath.tag.value.shift
                  ? finishedMatch.parentPreviousTagPath.tag.value.shift.index
                  : m.didShift
                  ? 1
                  : 0;

              tagPath = TagPath.fromNode(m.rootNode, 1 + shiftIndex);
            }
          }

          if (tagPath?.tag.type === Property) {
            tagPath = tagPath.next;
          }
          continue;
        }

        if (!m.emitted || !tagPath.equalTo(m.emitted)) {
          if (
            !(
              [OpenNodeTag, CloseNodeTag].includes(tagPath.tag.type) &&
              tagPath.depth === 0 &&
              isMultiFragment(tagPath.node) &&
              (m.depth || !(m.matcher.type === '__'))
            )
          ) {
            m.emitted = emitted = tagPath;
            this.emittedMatch = m;

            if (tagPath.tag.type === OpenNodeTag && !tagPath.tag.value.selfClosing) {
              state.depths.emitted++;
            } else if (tagPath.tag.type === CloseNodeTag) {
              state.depths.emitted--;
            }

            if (
              tagPath.tag.type !== Property &&
              !(tagPath.tag.type === BindingTag && !tagPath.tag.value.segments?.length) &&
              !(tagPath.tag.type === ShiftTag && options.holdShiftedNodes) &&
              !(tagPath.tag.type === AttributeDefinition && options.holdUndefinedAttributes) &&
              !(m.depth === 0 && !tagPath.depth && tagPath.tag.type === ReferenceTag)
            ) {
              yield tagPath.tag;
            }
          }
        }

        if (
          endsNode(tagPath.tag) ||
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
              // TODO is -1 ok
              let shiftIndex = m.didShift ? -1 : 0;
              tagPath = TagPath.fromNode(m.rootNode, shiftIndex);
            } else if (m.parent && (!m.parent.running || m.parent.running !== m)) {
              tagPath = m.parentPreviousTagPath;

              tagPath = TagPath.from(
                tagPath.path,
                tagPath.tagsIndex +
                  1 +
                  (m.matcher.type === '__' ? Tags.getSize(m.rootNode.value.children) : 1),
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
            ? tagPath.nextProperty?.next || tagPath.nextSibling
            : options.holdShiftedNodes
            ? tagPath.nextUnshifted
            : tagPath.next;

        if (!tagPath && m.running) {
          m = m.running;
          tagPath = TagPath.fromNode(m.rootNode, 0);
        }
      }
    }
  }

  getPublic() {
    let cached = facades.get(this);
    if (cached) {
      return cached;
    }

    let {
      parent,
      cover,
      nodeMatch,
      shiftMatch,
      coveredBoundary,
      mergedReference,
      matcher,
      propertyMatcher,
      rawPropertyMatcher,
      language,
      isNode,
      isCover,
      isCoverBoundary,
      effects,
      options,
      allowEmpty,
      depth,
      state,
    } = this;

    let getParent = () => {
      let value = parent;
      if (parent) facades.set((value = facades.get(parent) || parent.getPublic()));
      return value;
    };

    let getCover = () => {
      let value = cover;
      if (cover) facades.set((value = facades.get(cover) || cover.getPublic()));
      return value;
    };

    let getCoveredBoundary = () => {
      let value = coveredBoundary;
      if (coveredBoundary)
        facades.set((value = facades.get(coveredBoundary) || coveredBoundary.getPublic()));
      return value;
    };

    let getNodeMatch = () => {
      let value = nodeMatch;
      if (nodeMatch) facades.set((value = facades.get(nodeMatch) || nodeMatch.getPublic()));
      return value;
    };

    let getShiftMatch = () => {
      let value = shiftMatch;
      if (shiftMatch) facades.set((value = facades.get(shiftMatch) || shiftMatch.getPublic()));
      return value;
    };

    let getState = () => {
      return state.getPublic();
    };

    let getNode = () => {
      return buildFacadeNode(referenceFromMatcher(this.propertyMatcher.refMatcher), this.node);
    };

    cached = {
      getParent,
      getCover,
      getCoveredBoundary,
      getNodeMatch,
      getShiftMatch,
      getState,
      getNode,
      flags: { ...matcher.flags, hasGap: this.rootNode.value.flags.hasGap },
      mergedReference,
      matcher,
      propertyMatcher,
      rawPropertyMatcher,
      language,
      isNode,
      isCover,
      isCoverBoundary,
      effects,
      options,
      allowEmpty,
      depth,
    };

    facades.set(this, cached);

    return cached;
  }
}
