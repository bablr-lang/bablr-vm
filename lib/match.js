import { getProduction } from '@bablr/helpers/grammar';

import * as Tags from '@bablr/agast-helpers/tags';
import * as BList from '@bablr/agast-helpers/b-list';
import * as BSet from '@bablr/agast-helpers/b-set';
import {
  buildReference,
  buildEscapeTag,
  buildNullTag,
  printBinding,
  printType,
  printTag,
  parseTagType,
  endsNode,
  printReference,
  parseTag,
} from 'agast';
import { mergeReferences, referenceFromMatcher, printSource } from '@bablr/agast-helpers/tree';
import { effectsFor, shouldBranch } from '@bablr/agast-vm-helpers';

import { buildFacadeNode } from './facades.js';
import {
  CloseNodeTag,
  OpenNodeTag,
  AttributeDefinitionTag,
  Property,
  ReferenceTag,
  ShiftTag,
  TreeNode,
  EmptyTag,
  SumsTag,
} from '@bablr/agast-helpers/symbols';
import { getCloseTag, has, nodeIsComplete, Path, TagPath } from '@bablr/agast-helpers/path';

import { freezeRecord, isObject, isSymbol, has as objHas } from '@bablr/agast-helpers/object';
import { arrayValues } from '@bablr/agast-helpers/iterable';
import { Callable } from '@bablr/agast-vm-helpers/symbols';
import { parse } from '@babel/eslint-parser';

let { freeze } = Object;

let facades = new WeakMap();

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

    if (m.name && !getProduction(m.grammar, m.name))
      throw new Error(`Production {type: ${printType(m.name)}} does not exist`);

    if (m.flags.token && !m.isNode) {
      throw new Error('tokens must be nodes');
    }

    finishedMatch = null;

    return m;
  }

  constructor(
    parent,
    context,
    state,
    matcher,
    effects,
    shiftMatch = null,
    literalValue = null,
    options = freeze({}),
  ) {
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
    this.effects = effects;
    this.shiftMatch = shiftMatch;
    this.emittedMatch = parent?.emittedMatch || this;
    this.literalValue = literalValue;
    this.initialHeld = null;

    this.depth = !parent ? 0 : parent.depth + 1;
    this.cover = null;
    this.running = null;
    this.options = options;

    let isNode = !matcher.value.nodeMatcher.value.type;
    let isCover = matcher.value.nodeMatcher.value.type === Symbol.for('_');

    this.languages = languages;
    this.rootSpans = state.spans;
    this.nodeMatch = isNode || !parent ? this : parent.nodeMatch;
    this.expressionMatch = shiftMatch
      ? shiftMatch.expressionMatch
      : parent?.expressionMatch || (matcher.value.reference?.value.flags.expression ? this : null);
    this.languageMatch = matcher.value.bindings.length || !parent ? this : parent.languageMatch;
    this.holdingMatch = parent?.holdingMatch || (options.hold ? this : null);

    this.cover =
      !shiftMatch && !parent?.isNode && parent?.cover && matcher.value.reference?.value.type !== '#'
        ? parent.cover
        : isCover && parent
        ? this
        : null;
    this.resultPath = null;
    this.nodeDepth = (parent?.nodeDepth ?? 0) + (isNode ? 1 : 0);
    this.parentPreviousTagPath = this.parent && TagPath.from(this.parent.path, -1, -1);
    this.initialHeld = this.coveredBoundary.shiftMatch
      ? shiftMatch
        ? freeze({ matchDepth: this.depth, node: shiftMatch.node })
        : state.held
      : null;
    this.emitted = this.parent?.emitted || null;

    if (!this.language) {
      throw new Error(`Unknown language ${printBinding(matcher.bindingMatcher)}`);
    }

    this.resultPath = Path.fromTag('<__>');
    if (!parent) {
      if (isNode || isCover) {
        this.resultPath = this.resultPath.advance('.:');
      }
    } else if (shiftMatch) {
      this.resultPath = this.resultPath.advance(printReference(shiftMatch.mergedReference));
    }
  }

  static from(context, state, matcher, options) {
    return new Match(null, context, state, matcher, effectsFor('eat'), null, null, options);
  }

  get rootNode() {
    return this.resultPath.atDepth(0).node;
  }

  get parentTagPath() {
    if (!this.parent) return null;
    let { tagsIndex } = this.parentPreviousTagPath;

    let nodePath =
      this.parent.type === Symbol.for('__')
        ? Path.from(this.parent.rootNode)
        : Path.from(this.parent.rootNode).childPathAt(-1).inner;
    return nodePath.tagPathAt(tagsIndex + (this.rootNode[1] ? 1 : 0));
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
    return this.propertyMatcher?.value.nodeMatcher.value;
  }

  get literalMatcher() {
    return this.matcher.literalValue;
  }

  get node() {
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

  advance(tag) {
    let s = this.state;

    this.resultPath = this.resultPath.advance(tag);

    if (!this.resultPath) throw new Error();

    let tagType = parseTagType(tag);

    if (tagType === OpenNodeTag) {
      s.depths.result++;
    } else if (tagType === CloseNodeTag) {
      s.depths.result--;
    }

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
  }

  startFrame(state, matcher, effects, shiftMatch, literalValue, options) {
    let { context } = this;

    let m = new Match(this, context, state, matcher, effects, shiftMatch, literalValue, options);

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

    // TODO what if there is something in the holding stack but not on top. Can that happen?
    if (s.held && parseTag(s.held[1][0]).value.type !== Symbol.for('#')) throw new Error();

    let bindingTags = finishedMatch.propertyMatcher.value.bindings || freezeRecord([]);

    for (let _ of arrayValues(bindingTags)) {
      finishedMatch.state.languages = BList.pop(finishedMatch.state.languages);
    }

    if (!m) {
      s.holding = BList.push(freeze({ matchDepth: 0, node: finishedMatch.rootNode }), s.holding);

      return m;
    }

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
      let lastProperty = Tags.getAt(-2, finishedMatch.rootNode);

      let returned;
      while ((returned = BList.getAt(-1, s.returning))?.matchDepth === m.depth) {
        m.advance(returned.node);
        s.returning = BList.pop(s.returning);
      }

      if (finishedMatch.isNode || finishedMatch.isCover) {
        s.holding = BList.push(
          freeze({ matchDepth: m.depth, node: finishedMatch.rootNode }),
          s.holding,
        );
        s.holdingMatches = BList.push(m, s.holdingMatches);
      } else {
        let tag_ = finishedMatch.shiftMatch ? lastProperty : finishedMatch.rootNode;
        if (finishedMatch.options.escape) {
          tag_ = lastProperty;
          tag_ = printTag(
            buildEscapeTag(
              printSource(finishedMatch.node),
              tag_.value.node.value.attributes.cooked,
            ),
          );
        }
        m.advance(tag_);
      }
    }

    return m;
  }

  throw_() {
    let { bind } = this.options;
    let finishedMatch = this;
    let m = finishedMatch.parent;
    let s = finishedMatch.state;
    let isShiftFallback =
      finishedMatch.shiftMatch &&
      finishedMatch.isCoverBoundary &&
      finishedMatch.effects.failure === 'none';

    if (!m) return m;

    m.running = null;

    if (this.shiftMatch?.running === this) {
      this.shiftMatch.running = null;
    }

    if (bind && !isShiftFallback) {
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
              m.advance(Tags.fromValues([tags[1][0], '', '', '', Tags.fromValues(['null '])], 1));
            }
          }
        }
      } else {
        m.advance(
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

    if (s.status === 'active' && shouldBranch(finishedMatch.effects)) {
      if (finishedMatch.literalMatcher) {
        s.languages = m.languages;
      } else {
        s.reject(finishedMatch);
      }
    }

    // m.state.resultPath = TagPath.fromNode(m.state.node, -1);

    return m;
  }

  *emit() {
    let { emittedMatch } = this;
    let { emitted, state } = emittedMatch;

    let m = emittedMatch;

    let node = m.node || m.rootNode;

    let tagPath = emitted
      ? emitted
      : Tags.getSize(node)
      ? TagPath.fromNode(m.rootNode, 1)?.inner?.openTagPath
      : null;

    while (tagPath) {
      // if (emittedMatch.initialHeld) {
      //   if (tagPath.path.parentIndex === 1 && tagPath.path.referenceTagPath.value.flags.hasGap) {
      //     tagPath = TagPath.from(tagPath.path.parent.push(1, true), 0);
      //   }
      // }

      if (this.holdingMatch) break;

      if (state.held && state.holdingMatch?.depth < m.depth) break;
      if (BList.getSize(state.returning)) break;

      if (
        tagPath.type === OpenNodeTag &&
        m.referencePath?.value.type === '@' &&
        !nodeIsComplete(tagPath.node)
      )
        break;

      if (tagPath.depth === 0 && endsNode(tagPath.tag)) {
        let finishedMatch = m;
        m = m.parent;

        if (!m || finishedMatch.running) break;

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

            tagPath = TagPath.fromNode(m.rootNode);
          }
        }

        if (tagPath?.type === Property) {
          tagPath = tagPath.next;
        }
        continue;
      }

      if (tagPath?.type === Property) {
        tagPath = tagPath.next;
        continue;
      }

      if (!m.emitted || !tagPath.equalTo(m.emitted)) {
        if (tagPath.type !== Property) {
          m.emitted = emitted = tagPath;
          m.emittedMatch = m;

          if (tagPath.type === OpenNodeTag && !tagPath.value.selfClosing) {
            state.depths.emitted++;
          } else if (tagPath.type === CloseNodeTag) {
            state.depths.emitted--;
          }

          if (
            tagPath.type !== EmptyTag &&
            tagPath.type !== SumsTag &&
            !([OpenNodeTag, CloseNodeTag].includes(tagPath.type) && tagPath.depth === 0) &&
            tagPath.type !== !(m.depth === 0 && !tagPath.depth && tagPath.type === ReferenceTag)
          ) {
            yield tagPath.tag;
          }
        }
      }

      if (endsNode(tagPath.tag)) {
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
            tagPath = TagPath.fromNode(m.rootNode, 0)?.next;
          } else if (m.parent && (!m.parent.running || m.parent.running !== m)) {
            tagPath = m.parentTagPath;

            tagPath = TagPath.from(
              Path.from(m.parent.rootNode).childPathAt(-1).inner,
              tagPath.tagsIndex +
                (m.matcher.type !== Symbol.for('__') ? Tags.getChildrenSize(m.rootNode) : 1),
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
          : tagPath.next;

      if (!tagPath && m.running) {
        m = m.running;
        state = m.state;
        if (state.depth) return;
        tagPath = TagPath.fromNode(m.rootNode);
      }
    }
  }

  getPublic() {
    let cached = facades.get(this);
    if (cached) {
      return cached;
    }

    let {
      flags,
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
      language,
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
      return buildFacadeNode(
        referenceFromMatcher(this.propertyMatcher.value.refMatcher),
        this.node,
      );
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
      flags,
      mergedReference,
      matcher,
      propertyMatcher,
      language,
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
