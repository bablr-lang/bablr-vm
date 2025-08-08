import { agast as createAgast, TagPathFacade as TagPath } from '@bablr/agast-vm';
import emptyStack from '@iter-tools/imm-stack';
import { WeakStackFrame } from '@bablr/weak-stack';
import { getCooked, maybeWait } from '@bablr/agast-helpers/stream';
import * as Tags from '@bablr/agast-helpers/tags';
import { reifyExpression } from '@bablr/agast-vm-helpers';
import {
  Matcher,
  Node,
  Regex,
  GapTag,
  InitializerTag,
  OpenNodeTag,
  ReferenceTag,
  ShiftTag,
  Property,
  BindingTag,
  PropertyWrapper,
} from '@bablr/agast-vm-helpers/symbols';
import {
  buildBindingTag,
  buildChild,
  buildInitializerTag,
  buildNullNode,
  buildProperty,
  buildPropertyWrapper,
  buildReferenceTag,
  getOr,
  multiFragmentFlags,
} from '@bablr/agast-helpers/tree';
import { match, guardWithPattern } from './utils/pattern.js';
import { facades, actuals } from './facades.js';
import { FragmentFacade } from './node.js';
import { wrapperIsFull } from '@bablr/agast-helpers/path';

const { freeze } = Object;

export const nodeStates = new WeakMap();

export const StateFacade = class BABLRStateFacade {
  constructor(state) {
    facades.set(state, this);
    freeze(this);
  }

  static from(source) {
    return State.from(actuals.get(source));
  }

  get ctx() {
    return actuals.get(this).context;
  }

  get span() {
    return actuals.get(this).span.name;
  }

  get resultPath() {
    return actuals.get(this).resultPath;
  }

  get result() {
    return actuals.get(this).result;
  }

  get referenceTag() {
    return actuals.get(this).referenceTag;
  }

  get referenceTagPath() {
    return actuals.get(this).referenceTagPath;
  }

  get referencePath() {
    return actuals.get(this).referencePath;
  }

  get holding() {
    return actuals.get(this).holding;
  }

  get language() {
    return actuals.get(this).language;
  }

  get depths() {
    const { path, result, shift, nodeShift } = actuals.get(this).depths;
    return { path, result, shift, nodeShift };
  }

  get held() {
    const { held } = actuals.get(this);
    return held && FragmentFacade.wrapNode(held.node, this.ctx);
  }

  get node() {
    return FragmentFacade.wrapNode(actuals.get(this).node, this.ctx);
  }

  get parentNode() {
    return FragmentFacade.wrapNode(actuals.get(this).parentNode, this.ctx);
  }

  get source() {
    return facades.get(actuals.get(this).source);
  }

  get depth() {
    return actuals.get(this).depth;
  }

  get status() {
    return actuals.get(this).status;
  }

  get parent() {
    return facades.get(actuals.get(this).parent);
  }

  nodeForPath(path) {
    return actuals.get(this).nodeForPath(path);
  }
};

export const State = class BABLRState extends WeakStackFrame {
  constructor(
    parent,
    source,
    context,
    language,
    expressions = emptyStack,
    balanced = emptyStack,
    spans = emptyStack.push({ name: 'Bare' }),
    referenceTagPath = null,
    resultPath = null,
    depths = { path: -1, result: -1, emitted: -1, shift: 0, nodeShift: 0 },
    held = null,
    agast = null,
  ) {
    super(parent);

    if (!source) throw new Error('invalid args to State');

    this.source = source;
    this.context = context;
    this.language = language;
    this.expressions = expressions;
    this.balanced = balanced;
    this.spans = spans;
    this.referenceTagPath = referenceTagPath;
    this.resultPath = resultPath;
    this.depths = depths;
    this.held = held;
    this.agast = agast;

    this.status = 'active';

    this.emitted = null;

    new StateFacade(this);
  }

  static from(source, context, language, expressions = []) {
    return State.create(
      source,
      context,
      language,
      emptyStack.push(...emptyStack.push(...expressions).valuesReverse()),
    );
  }

  get node() {
    return this.agast?.state.node;
  }

  get referencePath() {
    let refPath = this.referenceTagPath;

    if (!refPath) return null;

    let { previousSibling } = refPath;
    let isShift = previousSibling.tag.type === ShiftTag;

    let referenceTagPath = previousSibling;

    if (isShift) {
      let refIndex = previousSibling.tagsIndex - 1 - previousSibling.tag.value.index * 3;
      referenceTagPath = previousSibling.siblingAt(refIndex);
    }
    return referenceTagPath;
  }

  get guardedSource() {
    let { source, span } = this;
    let { guard } = span;

    return guard ? guardWithPattern(guard, source) : source;
  }

  get span() {
    return this.spans.value;
  }

  get path() {
    return this.agast?.state.path;
  }

  get result() {
    return this.resultPath.tag;
  }

  get parentNode() {
    throw new Error('not implemented');
  }

  get holding() {
    return !!this.held;
  }

  get referenceTag() {
    return this.referenceTagPath?.tag;
  }

  get isGap() {
    return this.tag.type === GapTag;
  }

  get speculative() {
    return !!this.parent;
  }

  guardedMatch(pattern, attributes = {}) {
    let { span, source } = this;
    let { guard } = span;

    let pattern_ = pattern;
    if (pattern.type === Matcher) {
      pattern_ = reifyExpression(pattern.value).nodeMatcher;
    } else if (pattern.type === Regex || pattern.type === Node) {
      pattern_ = pattern.value;
    } else if (typeof pattern !== 'string') {
      throw new Error();
    }

    if (span.type === 'Lexical' && attributes.balancer) {
      // also check that the open node starts a lexical span?
      guard = null;
    }

    if (pattern_?.literalValue) {
      pattern_ = pattern_.literalValue || getCooked(pattern_.tags);

      if (pattern_.type === Symbol.for('String')) {
        pattern_ = reifyExpression(pattern_);
      }
    }

    let guardedSource = guard && guardWithPattern(guard, source);

    let result = match(pattern_, guardedSource || source);

    return maybeWait(result, (result) => {
      if (guardedSource && !guardedSource.done) {
        guardedSource.return();
      }
      return result;
    });
  }

  match(pattern) {
    return match(pattern, this.source);
  }

  branch() {
    let baseState = this;
    let {
      agast,
      source,
      context,
      balanced,
      spans,
      resultPath,
      depths,
      referenceTagPath,
      held,
      node,
      language,
      expressions,
    } = baseState;

    let newAgast = createAgast(agast.options);

    let fragRefTag = buildReferenceTag('_', null, false, multiFragmentFlags);

    if (node.tags.openTag) newAgast.vm.next(node.tags.openTag);
    if (node.tags.childrenNode) {
      let property = buildProperty(fragRefTag.value, null, node.tags.childrenNode);
      newAgast.vm.next(
        buildChild(
          PropertyWrapper,
          buildPropertyWrapper(
            [fragRefTag, buildBindingTag(), buildChild(Property, property)],
            property,
          ),
        ),
      );
    }
    if (node.tags.closeTag) newAgast.vm.next(node.tags.closeTag);

    let newNode = newAgast.state.node;
    let nodeState = nodeStates.get(node);
    let newResultPath;

    if (resultPath.path.node === node) {
      newResultPath = TagPath.fromNode(newNode, resultPath.tagsIndex);
    } else {
      newResultPath = resultPath;
    }

    nodeStates.set(newNode, { ...nodeState });

    let child = this.push(
      source.branch(),
      context,
      language,
      expressions,
      balanced,
      spans,
      referenceTagPath,
      newResultPath,
      { ...depths },
      held,
      newAgast,
    );

    return child;
  }

  accept() {
    let accepted = this;

    this.status = 'accepted';

    let { parent } = this;

    if (!parent) {
      throw new Error('accepted the root state');
    }

    if (parent.depths.path === accepted.depths.path) {
      let parentChildren = parent.node.tags;

      if (parent.node.type !== accepted.node.type) throw new Error();

      let lastParentProp = parentChildren.at(-1);

      let partialOffset =
        lastParentProp.type === PropertyWrapper && !wrapperIsFull(lastParentProp) ? -1 : 0;

      for (let i = parentChildren.size + partialOffset; i < accepted.node.tags.size; i++) {
        let acceptedTag = accepted.node.tags.at(i);
        let tag = parentChildren.at(i);

        // let wrapperTag =

        for (
          let i = tag ? Tags.getSize(tag.value.tags) : 0;
          i < Tags.getSize(acceptedTag.value.tags);
          i++
        ) {
          let tag = Tags.getAt(i, acceptedTag.value.tags);

          parent.agast.vm.next(tag);
        }
      }
    }

    parent.spans = accepted.spans;
    parent.balanced = accepted.balanced;
    parent.referenceTagPath = accepted.referenceTagPath;
    parent.held = accepted.held;
    parent.depths = accepted.depths;
    parent.language = accepted.language;
    parent.expressions = accepted.expressions;

    if (parent.depths.result + 1 === accepted.depths.result) {
      parent.resultPath = parent.resultPath.siblingAt(accepted.resultPath.tagsIndex);
    } else {
      parent.resultPath = accepted.resultPath;
    }
    if (!parent.resultPath) throw new Error();

    nodeStates.set(parent.node, nodeStates.get(accepted.node));

    parent.source.accept(accepted.source);

    return parent;
  }

  reject(finishedMatch, options) {
    let { bind = false } = options;
    let rejectedState = this;

    let didBranch = finishedMatch.s !== finishedMatch.parent.state;
    let abandon =
      (!finishedMatch.isNode && !didBranch) ||
      finishedMatch.cover ||
      finishedMatch.effects.success === 'none';
    let shallower =
      finishedMatch.coveredBoundary.didShift &&
      finishedMatch.coveredBoundary.shiftMatch.state.depth === this.depth - 2
        ? finishedMatch.coveredBoundary.shiftMatch.state
        : this.parent;

    if (!abandon && shallower) {
      let parentChildren = shallower.node.tags;
      let ourChildren = finishedMatch.fragmentNode.tags;
      let refTag;

      if (shallower.node.type) {
        if (shallower.node.type !== rejectedState.node.type) throw new Error();

        for (let i = parentChildren.size; i < ourChildren.size; i++) {
          let tag = ourChildren.at(i);

          if (tag.type === PropertyWrapper) {
            for (let wrappedTag of tag.value.tags) {
              if (wrappedTag.type === ReferenceTag) {
                refTag = wrappedTag;
              }

              if ([InitializerTag, GapTag].includes(wrappedTag.type)) {
                let previousSibling = ourChildren.at(i, 0);
                let isShift = previousSibling.type === ShiftTag;

                let referenceTag = previousSibling;

                if (isShift) {
                  let refIndex = i - 1 - previousSibling.value.index;
                  referenceTag = ourChildren.at(refIndex, 0);
                }

                if (
                  !['#', '@'].includes(referenceTag.value.type) &&
                  !referenceTag.value.isArray &&
                  getOr(0, referenceTag.value.name, shallower.node) === 0 &&
                  refTag !== ShiftTag
                ) {
                  if (refTag !== ReferenceTag) {
                    shallower.agast.vm.next(refTag);
                  }

                  if (bind || wrappedTag.type === GapTag) {
                    shallower.agast.vm.next(
                      buildChild(Property, buildProperty(refTag.value, null, buildNullNode())),
                    );
                  } else {
                    shallower.agast.vm.next(wrappedTag);
                  }
                }
                refTag = null;
              }
            }
          }
        }

        if (refTag?.type === ReferenceTag) {
          if (
            refTag.value.name &&
            !refTag.value.isArray &&
            !shallower.node.properties.has(refTag.value.name)
          ) {
            if (bind) {
              shallower.agast.vm.next(refTag);
              shallower.agast.vm.next(
                buildChild(Property, buildProperty(refTag.value, [], buildNullNode())),
              );
            } else {
              if (!refTag.value.flags.expression) {
                shallower.agast.vm.next(refTag);
                shallower.agast.vm.next(buildInitializerTag(refTag.value.isArray));
              }
            }
          }
          shallower.referenceTagPath = null;
          shallower.resultPath = TagPath.fromNode(shallower.node, -1);
        }
      }
    }

    if (this.status === 'rejected') {
      return shallower;
    }

    if (this.status !== 'active') throw new Error();

    this.status = 'rejected';

    if (!shallower) throw new Error('rejected root state');

    rejectedState.source.reject();

    return shallower;
  }
};
