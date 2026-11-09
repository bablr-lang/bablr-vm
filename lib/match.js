import { getProduction } from '@bablr/helpers/grammar';

import * as Tags from '@bablr/agast-helpers/tags';
import * as BList from '@bablr/agast-helpers/b-list';
import * as BSet from '@bablr/agast-helpers/b-set';
import {
  buildReference,
  printBinding,
  printType,
  printTag,
  printReference,
  parseTag,
  buildLiteralTag,
} from 'agast';
import { mergeReferences, referenceFromMatcher, printSource } from '@bablr/agast-helpers/tree';

import { buildFacadeNode } from './facades.js';
import { Property } from '@bablr/agast-helpers/symbols';
import { getRoot, has, Path, propertyIsFull } from '@bablr/agast-helpers/path';

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
    let { nodeMatcher } = matcher.value;
    let isFragment = nodeMatcher.value.type === Symbol.for('__');

    let result = null;

    if (isFragment) {
      result = Path.advance(result, '<__>');
    }

    s.matchResults = BList.push(result, s.matchResults);

    return m;
  }

  constructor(parent, context, state, matcher, shiftMatch = null, options = freeze({})) {
    if (!context || !state) {
      throw new Error('Invalid arguments to Match constructor');
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
    this.emittingPaused = options.escape ? true : parent ? parent.emittingPaused : false;

    this.depth = !parent ? 0 : parent.depth + 1;
    this.cover = null;
    this.options = options;

    let isNode = !matcher.value.nodeMatcher.value.type;
    let isCover = matcher.value.nodeMatcher.value.type === Symbol.for('_');

    this.languages = state.languages;
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

  get reference() {
    let { parent, propertyMatcher } = this;
    let { reference } = propertyMatcher.value;

    if (this.shiftMatch) return this.shiftMatch.reference;

    return reference ? reference.value : buildReference(!parent || parent.isCover ? '_' : '.');
  }

  get pathName() {
    return this.reference.name;
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

    let bindingTags = finishedMatch.propertyMatcher.value.bindings || freezeRecord([]);

    for (let _ of arrayValues(bindingTags)) {
      s.languages = BList.pop(s.languages);
    }

    let { node } = s;

    s.matchResults = BList.pop(s.matchResults);
    s.finishedNode = node;

    if (!m) {
      return m;
    }

    let returned;
    while ((returned = BList.getAt(-1, s.returning))?.matchDepth === m.depth) {
      s.advance(returned.property);
      s.returning = BList.pop(s.returning);
    }

    if (!node) throw new Error();

    let { reference } = this;

    if (finishedMatch.options.escape) {
      let literalTag = printTag(
        buildLiteralTag(printSource(node), parseTag(node[0]).value.attributes.cooked),
      );
      s.advance(literalTag);
    } else {
      if (s.heldShift) {
        s.heldShift = node;
      } else {
        s.advance(node);
      }
    }

    return m;
  }

  throw_() {
    let { bind } = this.options;
    let finishedMatch = this;
    let m = finishedMatch.parent;

    // let isShiftFallback =
    //   finishedMatch.shiftMatch &&
    //   finishedMatch.isCoverBoundary &&
    //   finishedMatcheffects.failure === 'none';

    if (finishedMatch.shiftMatch) {
      finishedMatch.shiftMatch.doneShifting = true;
    }

    // s.matchResults = BList.pop(s.matchResults);

    if (!m) return m;

    let s = m.state;

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
            printReference(finishedMatch.reference),
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
      reference: () => this.reference,
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
