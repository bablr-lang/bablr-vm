import { getProduction } from '@bablr/helpers/grammar';

import * as Tags from '@bablr/agast-helpers/tags';
import * as BList from '@bablr/agast-helpers/b-list';
import * as BSet from '@bablr/agast-helpers/b-set';
import {
  buildReference,
  buildEscapeTag,
  printBinding,
  printType,
  printTag,
  parseTagType,
  printReference,
  parseTag,
  BindingTag,
  HashTag,
  NullTag,
  GapTag,
  parseReferenceTag,
} from 'agast';
import { mergeReferences, referenceFromMatcher, printSource } from '@bablr/agast-helpers/tree';

import { buildFacadeNode } from './facades.js';
import { OpenNodeTag, Property, ReferenceTag, SumsTag } from '@bablr/agast-helpers/symbols';
import { has, Path, TagPath } from '@bablr/agast-helpers/path';

import { freezeRecord, isObject, isSymbol } from '@bablr/agast-helpers/object';
import { arrayValues } from '@bablr/agast-helpers/iterable';
import { Callable } from '@bablr/agast-vm-helpers/symbols';

let { freeze } = Object;

let facades = new WeakMap();

export class Match {
  static startFrame(ctx, s, m, shiftMatch, matcher, options) {
    let isShift = !!shiftMatch; // should this be didShift?

    let parent = m;

    if (!s) throw new Error('not initialized');

    if (isShift && !parent) throw new Error();

    // s.languages = isShift
    //   ? finishedMatch.languages
    //   : parent
    //   ? parent.languages
    //   : s.languages;

    m = parent
      ? parent.startFrame(s, matcher, shiftMatch, options)
      : Match.from(ctx, s, matcher, options);

    if (m.name && !getProduction(m.grammar, m.name))
      throw new Error(`Production {type: ${printType(m.name)}} does not exist`);

    if (m.flags.token && !m.isNode) {
      throw new Error('tokens must be nodes');
    }
    let { reference, nodeMatcher } = matcher.value;
    let isNode = !nodeMatcher.value.type;
    let isCover = nodeMatcher.value.type === Symbol.for('_');

    let coverRoot = isCover && (!reference || reference.type === '_');

    let result = Path.advance(null, coverRoot ? '<_>' : '<__>');

    if (!parent) {
      if (isNode || isCover) {
        result = result.advance(coverRoot ? '_:' : '.:');
      }
    } else if (shiftMatch && !shiftMatch.doneShifting) {
      result = result.advance(printReference(shiftMatch.mergedReference));
    }

    s.matchResults = BList.push(result, s.matchResults);

    return m;
  }

  constructor(parent, context, state, matcher, shiftMatch = null, options = freeze({})) {
    if (!context || !state) {
      throw new Error('Invalid arguments to Match constructor');
    }

    let { bindings } = matcher.value;

    let languages = state.languages;
    let language = BList.getAt(-1, languages);

    for (let bindingTag of arrayValues(bindings)) {
      let { type, name } = bindingTag.value;

      language = type ? BList.getAt(-2, languages) : language.dependencies[name.description];

      languages = BList.push(language, languages);
    }

    if (parent && parent.cover && !parent.isNode) {
      if (matcher.value.reference) {
        let rm = matcher.value.reference.value;
        if (!['_', '#'].includes(rm.type) || rm.flags.hasGap || rm.flags.array) {
          throw new Error('no references inside covers');
        }
      }
    }
    if (matcher.type !== Callable) throw new Error();

    if (shiftMatch && matcher.value.nodeMatcher.type === Symbol.for('__')) {
      throw new Error();
    }

    if (shiftMatch && options.escape) throw new Error();

    let { name, type } = matcher.value.nodeMatcher.value;

    if (name && !isSymbol(name)) throw new Error();
    if (type && !isSymbol(type)) throw new Error();

    this.parent = parent;
    this.name = name;
    this.type = type;
    this.context = context;
    this.state = state;
    this.propertyMatcher = matcher;
    this.shiftMatch = shiftMatch;
    this.isShift = false;
    this.doneShifting = false;
    this.heldShift = null;

    this.depth = !parent ? 0 : parent.depth + 1;
    this.cover = null;
    this.options = options;

    let isNode = !matcher.value.nodeMatcher.value.type;
    let isCover = matcher.value.nodeMatcher.value.type === Symbol.for('_');

    this.languages = languages;
    this.rootSpans = state.spans;
    this.nodeMatch = isNode || !parent ? this : parent.nodeMatch;
    this.languageMatch = matcher.value.bindings.length || !parent ? this : parent.languageMatch;
    this.holdResult = state.heldProperty === '';

    this.cover =
      !shiftMatch && !parent?.isNode && parent?.cover && matcher.value.reference?.value.type !== '#'
        ? parent.cover
        : isCover && parent
        ? this
        : null;

    this.nodeDepth = (parent?.nodeDepth ?? 0) + (isNode ? 1 : 0);

    if (!this.language) {
      throw new Error(`Unknown language ${printBinding(matcher.bindingMatcher)}`);
    }
  }

  get parentPreviousTagPath() {
    throw new Error('deprecated');
  }

  get resultPath() {
    throw new Error('deprecated');
  }

  set resultPath(_) {
    throw new Error('deprecated');
  }

  static from(context, state, matcher, options) {
    return new Match(null, context, state, matcher, null, options);
  }

  get rootNode() {
    throw new Error('deprecated');
    return this.resultPath.atDepth(0).node;
  }

  get parentTagPath() {
    if (!this.parent) return null;
    let { tagsIndex } = this.parentPreviousTagPath;

    return Path.from(this.parent.rootNode).tagPathAt(tagsIndex + (this.rootNode[1] ? 1 : 0));
  }

  get language() {
    return BList.getAt(-1, this.languages);
  }

  get isCoverBoundary() {
    let { cover, isNode } = this;
    return cover === this || (!cover && isNode);
  }

  get matcher() {
    return this.propertyMatcher?.value.nodeMatcher.value;
  }

  get literalMatcher() {
    throw new Error('deprecated');
  }

  get rootProperty() {
    throw new Error('deprecated');
    return Tags.getChildrenAt(0, this.rootNode);
  }

  get node() {
    throw new Error('deprecated');
    let { rootNode } = this;

    if (this.matcher.type === Symbol.for('__')) {
      return rootNode;
    }
    if (!Tags.getChildrenSize(rootNode)) return null;

    return Tags.getChildrenAt(-1, rootNode)?.[4] ?? null;
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
        m.propertyMatcher.value.reference?.value ||
        buildReference(m.cover && !m.isCoverBoundary ? '_' : '.');
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
    return this.resultPath;
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
    return this.propertyMatcher.value.nodeMatcher.value.type === Symbol.for('_');
  }

  startFrame(state, matcher, effects, shiftMatch, options) {
    let { context } = this;

    let m = new Match(this, context, state, matcher, effects, shiftMatch, options);

    this.s.languages = m.languages;

    return m;
  }

  return() {
    const finishedMatch = this;
    const m = finishedMatch.parent;
    let s = finishedMatch.state;

    if (m && m.state !== finishedMatch.state) {
      s = s.parent;
    }

    if (finishedMatch.isShift && s.heldShift) {
      s.holding = BList.pop(s.holding);
    }

    // TODO what if there is something in the holding stack but not on top. Can that happen?
    if (s.held && parseTag(s.held[0]).value.type !== '#') throw new Error();

    let bindingTags = finishedMatch.propertyMatcher.value.bindings || freezeRecord([]);

    for (let _ of arrayValues(bindingTags)) {
      finishedMatch.state.languages = BList.pop(finishedMatch.state.languages);
    }

    let node = s.rootNode;

    s.matchResults = BList.pop(s.matchResults);
    s.finishedNode = node;

    if (!m) {
      // TODO [1] safe?
      s.holding = BList.push(freeze({ matchDepth: 0, property: s.finishedNode[1] }), s.holding);

      return m;
    }

    let returned;
    while ((returned = BList.getAt(-1, s.returning))?.matchDepth === m.depth) {
      s.advance(returned.property);
      s.returning = BList.pop(s.returning);
    }

    if (node) {
      let { mergedReference } = this;
      for (let property of Tags.traverseChildren(node)) {
        if (
          finishedMatch.options.escape &&
          Tags.referencesAreEqual(mergedReference, parseReferenceTag(property[0]).value)
        ) {
          let node = property[4];
          property = printTag(
            buildEscapeTag(printSource(node), parseTag(node[0]).value.attributes.cooked),
          );
        }

        if (finishedMatch.isShift) {
          s.heldShift = property;
        }

        s.advance(property);
      }
    }

    return m;
  }

  throw_() {
    let { bind } = this.options;
    let finishedMatch = this;
    let m = finishedMatch.parent;
    let s = m.state;
    // let isShiftFallback =
    //   finishedMatch.shiftMatch &&
    //   finishedMatch.isCoverBoundary &&
    //   finishedMatcheffects.failure === 'none';

    if (finishedMatch.shiftMatch) {
      finishedMatch.shiftMatch.doneShifting = true;
    }

    // s.matchResults = BList.pop(s.matchResults);

    if (!m) return m;

    if (bind && !m.shiftMatch) {
      if (finishedMatch.type === Symbol.for('__')) {
        for (let tag of Tags.traverse(finishedMatch.rootNode.value.children)) {
          if (isObject(tag) && tag.type === Property) {
            let { reference, tags } = tagvalue;

            if (
              !['#', '@'].includes(reference.type) &&
              !reference.flags.array &&
              !has(reference.name, m.node) &&
              !shift
            ) {
              s.advance(Tags.fromValues([ref, '', '', '', Tags.fromValues(['null '])], 1));
            }
          }
        }
      } else {
        s.advance(
          Tags.fromValues([
            printReference(finishedMatch.mergedReference),
            '',
            '',
            '',
            Tags.fromValues(['null ']),
          ]),
        );
      }
    }

    // m.state.resultPath = TagPath.fromNode(m.state.node, -1);

    return m;
  }

  getPublic() {
    let cached = facades.get(this);
    if (cached) {
      return cached;
    }

    let { parent, cover, nodeMatch, shiftMatch, coveredBoundary, state } = this;

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
      return buildFacadeNode(
        referenceFromMatcher(this.propertyMatcher.value.refMatcher),
        this.node,
      );
    };

    cached = {
      ctx: () => this.ctx.getPublic(),
      state: () => this.state.getPublic(),
      name: () => this.name,
      type: () => this.type,
      parent: getParent,
      cover: getCover,
      coveredBoundary: getCoveredBoundary,
      nodeMatch: getNodeMatch,
      shiftMatch: getShiftMatch,
      node: getNode,
      flags: () => this.flags,
      mergedReference: () => this.mergedReference,
      matcher: () => this.matcher,
      propertyMatcher: () => this.propertyMatcher,
      language: () => this.language,
      literalMatcher: () => this.literalMatcher,
      literalValue: () => this.literalValue,
      isNode: () => this.isNode,
      isCover: () => this.isCover,
      isCoverBoundary: () => this.isCoverBoundary,
      options: () => this.options,
      allowEmpty: () => this.allowEmpty,
      depth: () => this.depth,
    };

    facades.set(this, cached);

    return cached;
  }
}
