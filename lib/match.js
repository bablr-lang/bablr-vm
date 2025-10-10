import { getProduction, resolveLanguage } from '@bablr/helpers/grammar';
import { WeakStackFrame } from '@bablr/weak-stack';

import { agast, TagPathFacade as TagPath, PathFacade as Path } from '@bablr/agast-vm';
import * as Tags from '@bablr/agast-helpers/tags';
import {
  buildBinding,
  buildBindingTag,
  buildChild,
  buildCloseNodeTag,
  buildNodeTag,
  buildOpenNodeTag,
  buildProperty,
  buildReference,
  buildReferenceTag,
  getFlagsWithGap,
  mergeReferences,
  multiFragmentFlags,
  printType,
} from '@bablr/agast-helpers/tree';
import { effectsFor, reifyExpression, shouldBranch } from '@bablr/agast-vm-helpers';
import * as sym from '@bablr/agast-vm-helpers/symbols';

import { facades, actuals } from './facades.js';
import {
  CloseNodeTag,
  OpenNodeTag,
  AttributeDefinition,
  PropertyWrapper,
  BindingTag,
  Property,
  GapTag,
  NullTag,
} from '@bablr/agast-helpers/symbols';
import { buildNullNode, isMultiFragment, offsetForTag } from '@bablr/agast-helpers/path';

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

  get previousTagPath() {
    return actuals.get(this).previousTagPath;
  }

  get mergedLanguagePath() {
    return actuals.get(this).mergedLanguagePath;
  }

  ancestors(...args) {
    return actuals.get(this).ancestors(...args);
  }
}

export class Match extends WeakStackFrame {
  static startFrame(language, ctx, s, m, finishedMatch, verb, matcher, options) {
    let effects = effectsFor(verb.description);
    let isShift = verb.description.startsWith('shift'); // should this be didShift?

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

    if (isShift && matcher_.nodeMatcher.flags.fragment && !matcher_.nodeMatcher.flags.cover) {
      throw new Error();
    }
    if (isShift && !parentMatch) throw new Error();

    if (shouldBranch(effects)) {
      s = s.branch();
    }

    m = parentMatch
      ? parentMatch.startFrame(s, matcher_, effects, isShift ? finishedMatch : null, options)
      : Match.from(ctx, language, s, matcher_, null, options);

    if (m.type !== sym.fragment && !getProduction(m.grammar, m.type))
      throw new Error(`Production {type: ${printType(m.type)}} does not exist`);

    if (m.flags.token && !m.isNode) {
      throw new Error('tokens must be nodes');
    }

    if (matcher_.refMatcher?.type === '#' && s.held) {
      s.source.unshift();
    }

    finishedMatch = null;

    ({ language } = m);

    if (!m.parent && m.flags.fragment && !m.flags.cover) {
      s.node = m.rootNode;
    }
    return m;
  }

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
    this.cover =
      !parent?.isNode && parent?.cover && matcher.refMatcher?.type !== '#'
        ? parent.cover
        : isCover && parent
        ? this
        : null;
    this.rootNode = null;
    this.nodeDepth = (parent?.nodeDepth ?? 0) + (isNode ? 1 : 0);
    this.previousTagPath = null;
    this.parentPreviousTagPath = this.parent && TagPath.from(this.parent.path, -1, -1);

    let held = null;
    if (this.coveredBoundary.shiftMatch) {
      held = state.held?.node;
    }
    this.agast = agast({ held });

    let parentHasGap = !this.parent
      ? this.matcher.flags.hasGap
      : this.parent.nodeMatch.node.flags.hasGap;

    this.agast.vm.next(
      buildOpenNodeTag(parentHasGap ? getFlagsWithGap(multiFragmentFlags) : multiFragmentFlags),
    );
    if (!this.parent) {
      this.previousTagPath = this.agast.state.path.tagPathAt(-1);
      if (isNode || isCover) {
        this.agast.vm.next(buildReferenceTag('.'));
        this.agast.vm.next(buildBindingTag());
      }
    } else if (shiftMatch) {
      this.agast.vm.next(buildNodeTag(shiftMatch.rootNode.node));
      this.previousTagPath = this.agast.state.path.tagPathAt(-1);
    } else {
      this.previousTagPath = this.agast.state.path.tagPathAt(-1);
    }
    this.rootNode = this.agast.state.node;

    new MatchFacade(this);
  }

  static from(context, language, state, matcher, props, options) {
    return Match.create(context, language, state, matcher, effectsFor('eat'), props, options);
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

    if (this.matcher.flags.fragment && !this.matcher.flags.cover) {
      return rootNode;
    }
    if (rootNode.tags.size <= 1) return null;

    let { property } = rootNode.children.at(-1).value;

    return property.node;
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
      if ((m.isNode || m.isCover) && !first) break;
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
    return !flags.fragment;
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
    let s = finishedMatch.state;

    finishedMatch.agast.vm.next(buildCloseNodeTag());

    if (finishedMatch.shiftMatch) {
      s.held = null;
    }

    if (!m) return m;

    m.running = null;

    if (shouldBranch(finishedMatch.effects)) {
      if (finishedMatch.effects.success !== 'none') {
        s = s.accept();
      } else {
        s = s.reject(finishedMatch);
      }
    }

    if (!m) {
      return m;
    }

    if (finishedMatch.effects.success !== 'none') {
      // for a a shift, only copy the parts of the stack that aren't already present from the last successful shift frame

      if (finishedMatch.shiftMatch) {
        let propertyWrapper = finishedMatch.rootNode.tags.at(-2);
        s.node = propertyWrapper.value.property.node;
        m.agast.vm.next(propertyWrapper.value.tags[0]);
        m.agast.vm.next(propertyWrapper.value.tags[1]);
        m.agast.vm.next(buildNodeTag(propertyWrapper.value.property.node.node));
      } else {
        s.node = finishedMatch.rootNode;
        m.agast.vm.next(buildNodeTag(s.node.node));
      }
    }

    if (m.propertyMatcher.refMatcher?.type === '#' && s.held) {
      s.source.shift();
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
      for (let tag of Tags.traverse(this.rootNode.children.values)) {
        if (tag.type === PropertyWrapper) {
          let { property } = tag.value;
          let { reference, shift } = property;

          if (
            !['#', '@'].includes(reference.type) &&
            !reference.isArray &&
            !m.node.properties.has(reference.name) &&
            !shift
          ) {
            m.agast.vm.next(
              buildChild(Property, buildProperty(reference, buildBinding(), buildNullNode())),
            );
          }
        }
      }
    }

    // restore successful parts of shift stack here
    if (s.status === 'active') {
      s.reject(finishedMatch);
    }

    // if (
    //   finishedMatch.isCoverBoundary &&
    //   finishedMatch.shiftMatch &&
    //   finishedMatch.effects.failure === 'none'
    // ) {
    //   m.agast.vm.next(buildNodeTag(finishedMatch.shiftMatch.rootNode.node));

    //   s.node = finishedMatch.shiftMatch.node;
    // }

    m.state.resultPath = TagPath.fromNode(m.state.node, -1);

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
              (tagPath.tag.type === AttributeDefinition && options.holdUndefinedAttributes) ||
              ([OpenNodeTag, CloseNodeTag].includes(tagPath.tag.type) &&
                isMultiFragment(tagPath.node) &&
                (this.depth || !(this.matcher.flags.fragment && !this.matcher.flags.cover)))
            )
          ) {
            yield tagPath.tag;
          }
        }

        if (
          [CloseNodeTag, GapTag, NullTag].includes(tagPath.tag.type) ||
          (tagPath.tag.type === OpenNodeTag && tagPath.tag.value.selfClosing) ||
          (!holdShifted && !tagPath.nextSibling)
        ) {
          if (tagPath.next) {
            tagPath = tagPath.next;
            continue;
          }

          do {
            if (m.running) {
              m = m.running;
              tagPath = TagPath.fromNode(m.rootNode, 1, 0);
            } else if (m.parent && (!m.parent.running || m.parent.running !== m)) {
              // a multi-fragment inserts many properties into its parent
              // how many do we need to skip over?
              //   m.rootNode.children.size
              tagPath = m.parentPreviousTagPath;

              tagPath = TagPath.from(
                tagPath.path,
                tagPath.tagsIndex +
                  1 +
                  (m.matcher.flags.fragment && !m.matcher.flags.cover
                    ? m.rootNode.children.size
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

        if (holdShifted) {
          tagPath = tagPath.nextUnshifted;
        } else if (tagPath.nextSibling) {
          tagPath = tagPath.next;
        }
      }
    }
  }
}
