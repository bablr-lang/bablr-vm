import {
  agast as createAgast,
  TagPathFacade as TagPath,
  PathFacade as Path,
} from '@bablr/agast-vm';
import emptyStack from '@iter-tools/imm-stack';
import { WeakStackFrame } from '@bablr/weak-stack';
import { getCooked, maybeWait } from '@bablr/agast-helpers/stream';
import { reifyExpression } from '@bablr/agast-vm-helpers';
import {
  EmbeddedMatcher,
  EmbeddedNode,
  EmbeddedRegex,
  GapTag,
  InitializerTag,
  OpenNodeTag,
  ReferenceTag,
  ShiftTag,
  Property,
  BindingTag,
} from '@bablr/agast-vm-helpers/symbols';
import {
  buildBindingTag,
  buildChild,
  buildInitializerTag,
  buildNullNode,
  buildProperty,
} from '@bablr/agast-helpers/tree';
import { match, guardWithPattern } from './utils/pattern.js';
import { facades, actuals } from './facades.js';
import { FragmentFacade } from './node.js';
import { buildFullPathSegment } from '@bablr/agast-helpers/path';

const { hasOwn, freeze } = Object;

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

  get reference() {
    return actuals.get(this).reference;
  }

  get referenceTagPath() {
    return actuals.get(this).referenceTagPath;
  }

  get unshiftedReferencePath() {
    return actuals.get(this).unshiftedReferencePath;
  }

  get holding() {
    return actuals.get(this).holding;
  }

  // FACADEME
  get path() {
    return actuals.get(this).path;
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
    depths = { path: -1, result: -1, emitted: -1, shift: -1, nodeShift: -1 },
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
    return State.create(source, context, language, emptyStack.push(...expressions));
  }

  get node() {
    return this.agast?.state.node;
  }

  get unshiftedReferencePath() {
    let refPath = this.referenceTagPath;

    if (!refPath) return null;

    let { previousSibling } = refPath;
    let isShift = previousSibling.tag.type === ShiftTag;

    let referenceTagPath = previousSibling;

    if (isShift) {
      let refIndex = previousSibling.childrenIndex - 1 - previousSibling.tag.value.index * 3;
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
    throw new Error('not implemented');
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

  get reference() {
    return this.referenceTagPath?.tag;
  }

  get isGap() {
    return this.tag.type === GapTag;
  }

  get speculative() {
    return !!this.parent;
  }

  guardedMatch(pattern) {
    let { span, source } = this;
    let { guard } = span;

    let pattern_ = pattern;
    if (pattern.type === EmbeddedMatcher) {
      pattern_ = reifyExpression(pattern.value).nodeMatcher;
    } else if (pattern.type === EmbeddedRegex || pattern.type === EmbeddedNode) {
      pattern_ = pattern.value;
    } else if (typeof pattern !== 'string') {
      throw new Error();
    }

    let openNode =
      this.resultPath.tag.type === OpenNodeTag && this.resultPath.tag.value.flags.token
        ? this.resultPath.node
        : typeof pattern_ === 'string'
        ? null
        : pattern_;

    if (
      span.type === 'Lexical' &&
      openNode &&
      (openNode.flags.token
        ? openNode.attributes.balancer || openNode.attributes.balanced
        : openNode.attributes?.balancer)
    ) {
      // also check that the open node starts a lexical span?
      guard = null;
    }

    if (pattern_?.intrinsicValue) {
      pattern_ = pattern_.intrinsicValue || getCooked(pattern_.children);

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

    let newAgast = createAgast();

    for (let tagPath = TagPath.fromNode(node, 0); tagPath; tagPath = tagPath.nextSibling) {
      let { tag } = tagPath;

      if (tag.type === Property && tag.value.reference.name) {
        let refTag = tagPath.previousSibling.previousSibling.tag;
        let bindingTag = tagPath.previousSibling.tag;
        let isShift = refTag.type === ShiftTag;
        let firstRef = isShift
          ? tagPath.siblingAt(tagPath.childrenIndex - refTag.value.index * 3 - 1).tag
          : refTag;
        let { name, type, isArray } = firstRef.value;

        let segment = buildFullPathSegment(
          type,
          name,
          isArray ? newAgast.state.node.properties.at(name)?.size - (isShift ? 1 : 0) : null,
        );

        if (isShift) {
          segment.shiftIndex = (refTag.value.index || 0) + 1;
        }

        let expr = node.get(segment);
        newAgast.vm.next(
          buildChild(Property, buildProperty(refTag.value, bindingTag.value, expr.node)),
        );
      } else {
        newAgast.vm.next(tag);
      }
    }

    let newNode = newAgast.state.node;
    let nodeState = nodeStates.get(node);
    let newResultPath;

    if (resultPath.path.node === node) {
      newResultPath = TagPath.fromNode(newNode, resultPath.childrenIndex);
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
      let parentChildren = parent.node.children;

      let parentPath = Path.from(parent.node);

      if (parent.node.type !== accepted.node.type) throw new Error();

      for (let i = parentChildren.size; i < accepted.node.children.size; i++) {
        let tag = accepted.node.children.at(i);

        if (tag.type === Property) {
          let bindSibling = accepted.node.children.at(i - 1);
          let refSibling = accepted.node.children.at(i - 2);
          let isShift = refSibling.type === ShiftTag;
          let reference = refSibling;

          if (isShift) {
            reference = accepted.node.children.at(i - 2 - refSibling.value.index * 3);
          }

          let { type, name, isArray } = reference.value;
          let pathDesc = buildFullPathSegment(
            type,
            name,
            isArray
              ? (parentPath.node.properties.at(name)?.size ?? 0) - 1 + (isShift ? 0 : 1)
              : null,
            isShift ? refSibling.value.index : null,
          );

          let expr = accepted.node.get([pathDesc]);

          parent.agast.vm.next(
            buildChild(Property, buildProperty(reference.value, bindSibling.value, expr.node)),
          );
        } else {
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
      parent.resultPath = parent.resultPath.siblingAt(accepted.resultPath.childrenIndex);
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
    let shallower = finishedMatch.didShift ? finishedMatch.shiftMatch.state : this.parent;

    if (shallower) {
      let parentChildren = shallower.node.children;
      let ourChildren = finishedMatch.fragmentNode.children;
      let refTag;
      let bindTag;

      if (!abandon && shallower.node.type) {
        if (shallower.node.type !== rejectedState.node.type) throw new Error();

        for (let i = parentChildren.size; i < ourChildren.size; i++) {
          let tag = ourChildren.at(i);

          if (tag.type === ReferenceTag) {
            refTag = tag;
          }
          if (tag.type === BindingTag) {
            bindTag = tag;
          }

          if ([InitializerTag, GapTag].includes(tag.type)) {
            let previousSibling = ourChildren.at(i - 1);
            let isShift = previousSibling.type === ShiftTag;

            let reference = previousSibling;

            if (isShift) {
              let refIndex = i - 1 - previousSibling.value.index * 3;
              reference = ourChildren.at(refIndex);
            }

            if (
              !['#', '@'].includes(reference.value.type) &&
              !reference.value.isArray &&
              !hasOwn(shallower.node.properties, reference.value.name) &&
              refTag !== ShiftTag
            ) {
              if (refTag !== ReferenceTag) {
                shallower.agast.vm.next(refTag);
              }

              if (bind || tag.type === GapTag) {
                shallower.agast.vm.next(
                  buildChild(Property, buildProperty(refTag.value, null, buildNullNode())),
                );
              } else {
                shallower.agast.vm.next(tag);
              }
            }
            refTag = null;
          }
        }

        if (refTag?.type === ReferenceTag) {
          if (
            !['#', '@'].includes(refTag.value.type) &&
            !refTag.value.isArray &&
            !hasOwn(shallower.node.properties, refTag.value.name)
          ) {
            if (bind) {
              shallower.agast.vm.next(refTag);
              shallower.agast.vm.next(buildBindingTag(null));
              shallower.agast.vm.next(
                buildChild(Property, buildProperty(refTag.value, null, buildNullNode())),
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
