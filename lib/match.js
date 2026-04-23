import { getProduction } from '@bablr/helpers/grammar';

import { agast } from '@bablr/agast-vm';
import * as Tags from '@bablr/agast-helpers/tags';
import * as BList from '@bablr/agast-helpers/b-list';
import * as BSet from '@bablr/agast-helpers/b-set';
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
  buildChild,
  buildNullTag,
  printTag,
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
  endsNode,
  getCloseTag,
  has,
  isMultiFragment,
  Path,
  TagPath,
} from '@bablr/agast-helpers/path';
import { parseTagType } from '@bablr/agast-helpers/builders';
import { freezeRecord, isObject } from '@bablr/agast-helpers/object';
import { arrayValues } from '@bablr/agast-helpers/iterable';

let { freeze } = Object;

let facades = new WeakMap();

export const buildNode = (tag) => {
  let { vm, getState } = agast();
  vm.next(tag);
  return TagPath.wrap(getState().resultPath).node;
};

const normalizeBindingPath = (path) => {
  if (path.length <= 1) return path;
};

export class Match {
  static startFrame(ctx, s, m, finishedMatch, verb, matcher, literalValue, options) {
    let effects = effectsFor(verb.description);
    let isShift = verb.description.startsWith('shift'); // should this be didShift?

    let parentMatch = m;

    if (!s) throw new Error('not initialized');

    if (isShift && !parentMatch) throw new Error();

    s.languages = isShift
      ? finishedMatch.languages
      : parentMatch
      ? parentMatch.languages
      : s.languages;

    m = parentMatch
      ? parentMatch.startFrame(
          s,
          matcher,
          effects,
          isShift ? finishedMatch : null,
          literalValue,
          options,
        )
      : Match.from(ctx, s, matcher, options);

    if (m.name && !m.isLiteral && !getProduction(m.grammar, m.name))
      throw new Error(`Production {type: ${printType(m.name)}} does not exist`);

    if (m.flags.token && !m.isNode) {
      throw new Error('tokens must be nodes');
    }

    finishedMatch = null;

    if (!m.parent && m.type === Symbol.for('__')) {
      s.node = m.rootNode;
    }
    return m;
  }

  constructor(
    parent,
    context,
    state,
    rawMatcher,
    effects,
    shiftMatch = null,
    literalValue = null,
    options = freeze({}),
  ) {
    if (!context || !state) {
      throw new Error('Invalid arguments to Match constructor');
    }
    let matcher = reifyExpression(rawMatcher);

    let { bindingMatchers } = matcher;

    let languages = state.languages;
    let language = BList.getAt(-1, languages);

    for (let bindingMatcher of arrayValues(bindingMatchers)) {
      let { segments } = bindingMatcher || { segments: [] };

      for (let segment of arrayValues(segments)) {
        language = segment.type ? BList.getAt(-2, languages) : language.dependencies[segment.name];
      }

      languages = BList.push(language, languages);
    }

    if (parent && parent.cover && !parent.isNode) {
      if (matcher.refMatcher) {
        let rm = matcher.refMatcher;
        if (
          !['_', '#'].includes(rm.type) ||
          rm.flags.expression ||
          rm.flags.hasGap ||
          rm.flags.array
        ) {
          throw new Error('no references inside covers');
        }
      }
    }

    if (shiftMatch && matcher.nodeMatcher.type === Symbol.for('__')) {
      throw new Error();
    }

    let { name, type } = matcher.nodeMatcher;

    this.parent = parent;
    this.name = name && Symbol.for(name);
    this.type = type && Symbol.for(type);
    this.context = context;
    this.state = state;
    this.rawPropertyMatcher = rawMatcher;
    this.propertyMatcher = matcher;
    this.effects = effects;
    this.shiftMatch = shiftMatch;
    this.emittedMatch = parent?.emittedMatch || this;
    this.literalValue = literalValue;

    this.depth = !parent ? 0 : parent.depth + 1;
    this.agast = null;
    this.cover = null;
    this.running = null;
    this.options = options;

    let isNode = !matcher.nodeMatcher.type;
    let isCover = matcher.nodeMatcher.type === '_';

    this.languages = languages;
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
    this.parentTagPath = null;
    this.emitted = this.parent?.emitted || null;

    if (!this.language) {
      throw new Error(`Unknown language ${printBinding(matcher.bindingMatcher)}`);
    }

    let held = null;
    if (this.coveredBoundary.shiftMatch) {
      held = state.held;
    }
    this.agast = agast(freeze({ held }));

    let parentHasGap = !this.parent
      ? this.matcher.flags.hasGap
      : this.parent.nodeMatch.node.value.flags.hasGap;

    this.agast.vm.next(parentHasGap ? '<$__>' : '<__>');
    if (!this.parent) {
      if (isNode || isCover) {
        this.agast.vm.next('.:');
      }
    } else if (shiftMatch) {
      this.agast.vm.next(shiftMatch.rootNode);
    }
    this.rootNode = this.agast.getState().node;
  }

  static from(context, state, matcher, options) {
    return new Match(null, context, state, matcher, effectsFor('eat'), null, null, options);
  }

  get language() {
    return BList.getAt(-1, this.languages);
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

  get literalMatcher() {
    return this.matcher.literalValue;
  }

  get isLiteral() {
    return this.options.literal;
  }

  get node() {
    let { rootNode } = this;

    if (this.matcher.type === '__') {
      return rootNode;
    }
    if (Tags.getSize(Tags.getTags(rootNode)) <= 1) return null;

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
    return this.context.getGrammar(this.language);
  }

  get s() {
    return this.state;
  }

  get flags() {
    return this.matcher?.flags;
  }

  get allowEmpty() {
    return (
      (this.name && !!BSet.has(this.name.description, this.grammar.emptyables)) ||
      this.options.allowEmpty
    );
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

    let tagType = parseTagType(tag);

    if (tagType === OpenNodeTag) {
      s.depths.result++;
    } else if (tagType === CloseNodeTag) {
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

  startFrame(state, rawMatcher, effects, shiftMatch, literalValue, options) {
    let { context } = this;

    let m = new Match(this, context, state, rawMatcher, effects, shiftMatch, literalValue, options);

    this.running = m;

    this.s.languages = m.languages;

    return m;
  }

  return() {
    const finishedMatch = this;
    const m = finishedMatch.parent;
    let s = finishedMatch.state;

    if (finishedMatch.shiftMatch && s.shifted) {
      s.holding = BList.pop(s.holding);
      s.holdingMatches = BList.pop(s.holdingMatches);
    }

    let matchers = finishedMatch.propertyMatcher.bindingMatchers || freezeRecord([]);

    for (let matcher of arrayValues(matchers)) {
      let { segments } = matcher;
      let normalizedSegments = normalizeBindingPath(segments);
      if (normalizedSegments.length) {
        finishedMatch.state.languages = BList.pop(finishedMatch.state.languages);
      }
    }

    if (!m) return m;

    if (shouldBranch(finishedMatch.effects) && !this.literalValue) {
      if (finishedMatch.effects.success === 'eat') {
        s = s.accept();
      } else {
        s = s.reject(finishedMatch);
      }
    }

    m.emitted = finishedMatch.emitted;
    m.emittedMatch = finishedMatch.emittedMatch;

    if (finishedMatch.effects.success === 'eat') {
      let property = Tags.getAt(-2, finishedMatch.rootNode.value.tags);

      s.node = finishedMatch.shiftMatch ? property.value.node : finishedMatch.rootNode;

      let returned;
      while ((returned = BList.getAt(-1, s.returning))?.matchDepth === m.depth) {
        m.advance(returned.node);
        s.returning = BList.pop(s.returning);
      }
      if (finishedMatch.isNode) {
        s.holding = BList.push(
          freeze({ matchDepth: m.depth, node: finishedMatch.rootNode }),
          s.holding,
        );
        s.holdingMatches = BList.push(m, s.holdingMatches);
      } else {
        m.advance(finishedMatch.shiftMatch ? property : finishedMatch.rootNode);

        finishedMatch.parentTagPath = s.resultPath.propertyPath;
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

    if (this.shiftMatch?.running === this) {
      this.shiftMatch.running = null;
    }

    // TODO don't do this if we're falling back to a successful shift either
    if (bind) {
      if (finishedMatch.type === Symbol.for('__')) {
        for (let tag of Tags.traverse(finishedMatch.rootNode.value.children)) {
          if (isObject(tag) && tag.type === Property) {
            let { reference, shift, tags } = tag.value;

            if (
              !['#', '@'].includes(reference.type) &&
              !reference.flags.array &&
              !has(reference.name, m.node) &&
              !shift
            ) {
              m.advance(
                buildPropertyTag(
                  Tags.fromValues([tags[1][0], Tags.fromValues([]), buildNode(buildNullTag())], 1),
                ),
              );
            }
          }
        }
      } else {
        m.advance(
          buildPropertyTag(
            Tags.fromValues([
              printTag(buildChild(ReferenceTag, finishedMatch.mergedReference)),
              Tags.fromValues([]),
              buildNode('null'),
            ]),
          ),
        );
      }
    }

    if (s.status === 'active' && shouldBranch(finishedMatch.effects)) {
      if (finishedMatch.literalMatcher) {
        s.languages = m.languages;
        s.node = m.node;
      } else {
        s.reject(finishedMatch);
      }
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
    let { emitted, emittedMatch } = this;
    let { state } = emittedMatch;

    let m = emittedMatch;

    let node = m.node || m.rootNode;

    let tagPath = emitted
      ? emitted
      : Tags.getSize(Tags.getTags(node))
      ? TagPath.fromNode(m.rootNode, 0)
      : null;

    while (tagPath) {
      // if (
      //   options.holdUndefinedAttributes &&
      //   tagPath.type === OpenNodeTag &&
      //   tagPath.value.name
      //   && (countUndefinedAttributes(m.node) ?? 0) > 0
      // ) {
      //   break;
      // }

      if (this.holdingMatch) break;

      if (state.held && state.holdingMatch.depth < m.depth) break;
      if (BList.getSize(state.returning)) break;

      if (
        tagPath.type === OpenNodeTag &&
        m.referencePath?.value.type === '@' &&
        tagPath.node.flags.hasGap
      )
        break;

      let holdingShifted =
        options.holdShiftedNodes &&
        tagPath.type === ReferenceTag &&
        tagPath.value.flags.expression &&
        tagPath.depth <= 1;

      if (holdingShifted) {
        if (!tagPath.equalTo(this.emitted)) {
          this.emitted = emitted = tagPath;
          this.emittedMatch = m;

          yield tagPath.tag;
        }

        if (
          m.expressionMatch &&
          (m.expressionMatch.running || !getCloseTag(m.expressionMatch.rootNode))
        ) {
          break;
        } else {
          let previousTagPath, match;
          if (m.parent.running !== m) {
            match = m.parent;
            ({ parentPreviousTagPath: previousTagPath } = m);
          } else {
            match = m;
            previousTagPath = tagPath.previousSibling;
          }

          let nextTag =
            previousTagPath && Tags.getAt(previousTagPath.tagsIndex + 2, match.node.value.tags);

          let doneShifting = !(nextTag?.type === Property && nextTag.value.shift);

          // todo monomorph
          let shiftIndex = nextTag?.type === Property ? nextTag?.value.shift?.index ?? 0 : 0;
          while (!doneShifting && nextTag) {
            nextTag =
              Tags.getAt([previousTagPath.tagsIndex + 2 + shiftIndex, 1], match.node.value.tags) ||
              Tags.getAt(previousTagPath.tagsIndex + 2 + shiftIndex, match.node.value.tags);
            doneShifting = nextTag && !(nextTag.type === Property && nextTag.value.shift);
            if (!doneShifting) {
              shiftIndex++;
            }
          }

          if ((previousTagPath && !nextTag) || !doneShifting) {
            break;
          } else {
            if (match.rootNode) {
              if (shiftIndex) {
                m = match;
                tagPath = Path.from(m.rootNode)
                  .tagPathAt(1)
                  .inner.tagPathAt(1 + shiftIndex, 0).nextSibling;
                if (tagPath?.type === TreeNode) {
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

        if (m.type !== Symbol.for('__')) {
          parentRoot = parentRoot.tagPathAt(getCloseTag(m.rootNode) ? -2 : -1).inner;
        }

        let parentNextTagPath =
          finishedMatch.parentTagPath &&
          parentRoot?.tagPathAt(finishedMatch.parentTagPath.tagsIndex + 1);

        tagPath = parentNextTagPath;

        if (!tagPath) {
          if (m.running) {
            m = m.running;
            state = m.state;

            if (state.depth) return;

            let shiftIndex =
              finishedMatch.parentPreviousTagPath.type === Property &&
              finishedMatch.parentPreviousTagPath.value.shift
                ? finishedMatch.parentPreviousTagPath.value.shift.index
                : m.didShift
                ? 1
                : 0;

            tagPath = TagPath.fromNode(m.rootNode, 1 + shiftIndex);
          }
        }

        if (tagPath?.type === Property) {
          tagPath = tagPath.next;
        }
        continue;
      }

      if (!m.emitted || !tagPath.equalTo(this.emitted)) {
        if (
          !(
            [OpenNodeTag, CloseNodeTag].includes(tagPath.type) &&
            tagPath.depth === 0 &&
            isMultiFragment(tagPath.node) &&
            (m.depth || !(m.matcher.type === '__'))
          )
        ) {
          this.emitted = emitted = tagPath;
          this.emittedMatch = m;

          if (tagPath.type === OpenNodeTag && !tagPath.value.selfClosing) {
            state.depths.emitted++;
          } else if (tagPath.type === CloseNodeTag) {
            state.depths.emitted--;
          }

          if (
            tagPath.type !== Property &&
            !(tagPath.type === BindingTag && !tagPath.value.segments?.length) &&
            !(tagPath.type === ShiftTag && options.holdShiftedNodes) &&
            !(tagPath.type === AttributeDefinition && options.holdUndefinedAttributes) &&
            !(m.depth === 0 && !tagPath.depth && tagPath.type === ReferenceTag)
          ) {
            yield tagPath.tag;
          }
        }
      }

      if (
        endsNode(tagPath.tag) ||
        (!holdingShifted && !tagPath.nextSibling && tagPath.type !== Property)
      ) {
        let nextPath = tagPath.next;
        if (nextPath) {
          tagPath = nextPath;
          continue;
        }

        do {
          if (m.running) {
            m = m.running;
            state = m.state;
            if (state.depth) return;
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
        tagPath.type === Property
          ? tagPath.nextProperty?.next || tagPath.nextSibling
          : options.holdShiftedNodes
          ? tagPath.nextUnshifted
          : tagPath.next;

      if (!tagPath && m.running) {
        m = m.running;
        state = m.state;
        if (state.depth) return;
        tagPath = TagPath.fromNode(m.rootNode, 0);
      }
    }
  }

  getPublic() {
    let cached = facades.get(this);
    if (cached) {
      return cached;
    }

    let {
      name,
      type,
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
      isLiteral,
      literalMatcher,
      literalValue,
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
      name,
      type,
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
      isLiteral,
      literalMatcher,
      literalValue,
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
