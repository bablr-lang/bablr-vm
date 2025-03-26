import emptyStack from '@iter-tools/imm-stack';
import { WeakStackFrame } from '@bablr/weak-stack';
import { getCooked } from '@bablr/agast-helpers/stream';
import { reifyExpression } from '@bablr/agast-vm-helpers';
import {
  EmbeddedMatcher,
  EmbeddedNode,
  EmbeddedRegex,
  GapTag,
  InitializerTag,
  ReferenceTag,
  ShiftTag,
} from '@bablr/agast-vm-helpers/symbols';
import * as btree from '@bablr/agast-helpers/btree';
import * as sumtree from '@bablr/agast-helpers/sumtree';
import {
  buildGapTag,
  buildInitializerTag,
  buildNullNode,
  buildNullTag,
  buildReferenceTag,
  buildStubNode,
} from '@bablr/agast-helpers/tree';
import { add, get, getShifted, Path, TagPath } from '@bablr/agast-helpers/path';
import { match, guardWithPattern } from './utils/pattern.js';
import { facades, actuals } from './facades.js';
import { buildInternalState, FragmentFacade, internalStates } from './node.js';
import { buildCall, buildEmbeddedTag } from '@bablr/agast-vm-helpers/builders';

const { hasOwn } = Object;

export const nodeStates = new WeakMap();

export const StateFacade = class BABLRStateFacade {
  constructor(state) {
    facades.set(state, this);
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

  get reference() {
    return actuals.get(this).reference;
  }

  get referencePath() {
    return actuals.get(this).referencePath;
  }

  get unshiftedReferencePath() {
    return actuals.get(this).unshiftedReferencePath;
  }

  get holding() {
    return actuals.get(this).holding;
  }

  get path() {
    return actuals.get(this).path;
  }

  get language() {
    return actuals.get(this).language;
  }

  get depths() {
    const { path, result } = actuals.get(this).depths;
    return { path, result };
  }

  get held() {
    const { held } = actuals.get(this);
    return held && FragmentFacade.wrapNode(held, this.ctx);
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
    referencePath = null,
    resultPath = null,
    depths = { path: -1, emitted: -1 },
    held = null,
    node = null,
  ) {
    super(parent);

    if (!source) throw new Error('invalid args to State');

    this.source = source;
    this.context = context;
    this.language = language;
    this.expressions = expressions;
    this.balanced = balanced;
    this.spans = spans;
    this.referencePath = referencePath;
    this.resultPath = resultPath;
    this.depths = depths;
    this.held = held;
    this.node = node;

    this.status = 'active';

    this.emitted = null;

    new StateFacade(this);
  }

  static from(source, context, language, expressions = []) {
    return State.create(source, context, language, emptyStack.push(...expressions));
  }

  get unshiftedReferencePath() {
    let refPath = this.referencePath;

    if (!refPath) return null;

    let { previousSibling } = refPath;
    let isShift = previousSibling.tag.type === ShiftTag;

    let referencePath = previousSibling;

    if (isShift) {
      let refIndex = i - 1 - previousSibling.tag.value.index * 2;
      referencePath = previousSibling.siblingAt(refIndex);
    }
    return referencePath;
  }

  get unboundAttributes() {
    return nodeStates.get(this.node).unboundAttributes;
  }

  get guardedSource() {
    const { source, span } = this;
    const { guard } = span;

    return guard ? guardWithPattern(guard, source) : source;
  }

  get span() {
    return this.spans.value;
  }

  get path() {
    throw new Error('not implemented');
  }

  get parentNode() {
    throw new Error('not implemented');
  }

  get holding() {
    return !!this.held;
  }

  get reference() {
    return this.referencePath?.tag;
  }

  get isGap() {
    return this.tag.type === GapTag;
  }

  get speculative() {
    return !!this.parent;
  }

  advance(tag) {
    const { path, instructionsPump, expressionsPump, agast } = internalStates.get(this.node);

    if (tag.type === GapTag) {
      expressionsPump.queue(
        this.expressions.size ? this.expressions.value : buildStubNode(buildGapTag()),
      );
      this.expressions = this.expressions.pop();
    }
    instructionsPump.queue(buildCall('advance', buildEmbeddedTag(tag)));
    agast.next();

    this.resultPath = TagPath.from(path, -1);
  }

  guardedMatch(pattern) {
    let { span, source } = this;
    let { guard } = span;

    let pattern_ = pattern;
    if (pattern.type === EmbeddedMatcher) {
      pattern_ = reifyExpression(pattern.value).nodeMatcher;
    } else if (pattern.type === EmbeddedRegex) {
      pattern_ = pattern.value;
    } else if (typeof pattern !== 'string') {
      throw new Error();
    }

    if (
      span.type === 'Lexical' &&
      pattern.type === EmbeddedMatcher &&
      (pattern_.flags.token
        ? pattern_.attributes.balancer || pattern_.attributes.balanced
        : pattern_.attributes?.balancer)
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

    return match(pattern_, guard ? guardWithPattern(guard, source) : source);
  }

  match(pattern) {
    return match(pattern, this.source);
  }

  branch() {
    const baseState = this;
    let {
      source,
      context,
      balanced,
      spans,
      resultPath,
      depths,
      referencePath,
      held,
      node,
      language,
      expressions,
    } = baseState;

    const internalState = buildInternalState();

    for (let tagPath = TagPath.fromNode(node, 0); tagPath; tagPath = tagPath.nextSibling) {
      let { tag } = tagPath;

      if (tag.type === GapTag) {
        let ref = tagPath.previousSibling.tag;
        let firstRef =
          ref.type === ShiftTag
            ? tagPath.siblingAt(tagPath.childrenIndex - ref.value.index * 2 - 1)
            : ref;
        let { name, isArray, flags } = firstRef.value;
        const resolvedPath = buildReferenceTag(
          name,
          isArray,
          flags,
          isArray ? btree.getSize(internalState.path.node.properties[name]) : null,
        );
        const expr = getShifted(ref.value.index || 0, resolvedPath, node);
        internalState.expressionsPump.queue(expr);
      } else if (tag.type === EmbeddedNode) {
        internalState.expressionsPump.queue(tag.value);
        tag = buildGapTag();
      }

      internalState.instructionsPump.queue(buildCall('advance', buildEmbeddedTag(tag)));
      internalState.agast.next();
    }

    const newNode = internalState.agastState.node;
    const nodeState = nodeStates.get(node);
    let newResultPath;

    if (resultPath.path.node === node) {
      newResultPath = TagPath.fromNode(newNode, resultPath.childrenIndex);
    } else {
      newResultPath = resultPath;
    }

    nodeStates.set(newNode, { ...nodeState });
    internalStates.set(newNode, internalState);

    const child = this.push(
      source.branch(),
      context,
      language,
      expressions,
      balanced,
      spans,
      referencePath,
      newResultPath,
      depths,
      held,
      newNode,
    );

    return child;
  }

  accept() {
    const accepted = this;

    this.status = 'accepted';

    const { parent } = this;

    if (!parent) {
      throw new Error('accepted the root state');
    }

    parent.spans = accepted.spans;
    parent.balanced = accepted.balanced;
    parent.referencePath = accepted.referencePath;
    parent.held = accepted.held;
    parent.depths = accepted.depths;
    parent.language = accepted.language;
    parent.expressions = accepted.expressions;

    if (parent.depths.path === accepted.depths.path) {
      const ourChildren = parent.node.children;

      const internalState = internalStates.get(parent.node);
      const { path: parentPath } = internalState;

      for (let i = sumtree.getSize(ourChildren); i < sumtree.getSize(accepted.node.children); i++) {
        let tag = sumtree.getAt(i, accepted.node.children);

        if (tag.type === GapTag) {
          let previousSibling = sumtree.getAt(i - 1, accepted.node.children);
          let isShift = previousSibling.type === ShiftTag;
          let reference = previousSibling;

          if (isShift) {
            reference = sumtree.getAt(
              i - 1 - previousSibling.value.index * 2,
              accepted.node.children,
            );
          }

          let { name, isArray, flags } = reference.value;
          const resolvedPath = buildReferenceTag(
            name,
            isArray,
            flags,
            isArray ? btree.getSize(parentPath.node.properties[name]) - (isShift ? 1 : 0) : null,
          );
          const expr = getShifted(
            isShift ? previousSibling.value.index : null,
            resolvedPath,
            accepted.node,
          );
          internalState.expressionsPump.queue(expr);
        } else if (tag.type === EmbeddedNode) {
          internalState.expressionsPump.queue(tag.value);
          tag = buildGapTag();
        }

        internalState.instructionsPump.queue(buildCall('advance', buildEmbeddedTag(tag)));
        internalState.agast.next();
      }
    }

    // if (parent.depths.result === accepted.depths.result + 1) {
    if (parent.depths.emitted === accepted.depths.emitted + 1) {
      parent.resultPath = new TagPath(parent.resultPath.path, accepted.resultPath.childrenIndex);
    } else {
      parent.resultPath = accepted.resultPath;
    }

    nodeStates.set(parent.node, nodeStates.get(accepted.node));

    parent.source.accept(accepted.source);

    return parent;
  }

  reject(ourNode, abandon = false, bind = false) {
    const rejectedState = this;
    const { parent } = rejectedState;

    if (parent) {
      const parentChildren = parent.node.children;
      const ourChildren = ourNode.children;
      const internalState = internalStates.get(parent.node);

      if (!abandon) {
        for (let i = sumtree.getSize(parentChildren); i < sumtree.getSize(ourChildren); i++) {
          let tag = sumtree.getAt(i, ourChildren);

          if ([InitializerTag, GapTag].includes(tag.type)) {
            let previousSibling = sumtree.getAt(i - 1, ourChildren);
            let isShift = previousSibling.type === ShiftTag;

            let reference = previousSibling;

            if (isShift) {
              let refIndex = i - 1 - previousSibling.value.index * 2;
              reference = sumtree.getAt(refIndex, ourChildren);
            }

            let lastParentTag = TagPath.from(internalState.path, -1).tag.type;

            if (
              !['#', '@'].includes(reference.value.name) &&
              !reference.value.isArray &&
              !hasOwn(parent.node.properties, reference.value.name) &&
              lastParentTag !== ShiftTag
            ) {
              if (lastParentTag !== ReferenceTag) {
                internalState.instructionsPump.queue(
                  buildCall('advance', buildEmbeddedTag(reference)),
                );
                internalState.agast.next();
              }
              if (bind || tag.type === GapTag) {
                internalState.expressionsPump.queue(buildNullNode());
                internalState.instructionsPump.queue(
                  buildCall('advance', buildEmbeddedTag(buildGapTag())),
                );
              } else {
                internalState.instructionsPump.queue(buildCall('advance', buildEmbeddedTag(tag)));
              }
              internalState.agast.next();
            }
          }
        }

        let lastParentTagPath = TagPath.fromNode(parent.node, -1);
        if (lastParentTagPath?.tag.type === ReferenceTag) {
          let ref = lastParentTagPath?.tag;
          if (bind) {
            internalState.expressionsPump.queue(buildNullNode());
            internalState.instructionsPump.queue(
              buildCall('advance', buildEmbeddedTag(buildGapTag())),
            );
            internalState.agast.next();
          } else {
            if (!ref.value.flags.expression) {
              internalState.instructionsPump.queue(
                buildCall('advance', buildEmbeddedTag(buildInitializerTag(ref.value.isArray))),
              );
              internalState.agast.next();
            }
          }
          parent.referencePath = null;
          parent.resultPath = TagPath.fromNode(parent.node, -1);
        }
      }
    }

    if (this.status === 'rejected') {
      return parent;
    }

    if (this.status !== 'active') throw new Error();

    this.status = 'rejected';

    if (!parent) throw new Error('rejected root state');

    rejectedState.source.reject();

    return parent;
  }
};
