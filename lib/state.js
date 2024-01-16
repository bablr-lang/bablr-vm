import { exec } from '@bablr/regex-vm';
import startsWithSeq from 'iter-tools-es/methods/starts-with-seq';
import emptyStack from '@iter-tools/imm-stack';
import { facades, actuals } from './utils/facades.js';
import { formatType } from './utils/format.js';
import { effectsFor, parsePath, reifyExpression } from './utils/instruction.js';
import { WeakStackFrame, freezeSeal } from './utils/object.js';
import {
  assertValidRegex,
  getCooked,
  buildReferenceTag,
  buildNodeOpenTag,
  buildFragmentOpenTag,
  buildNodeCloseTag,
  terminalTypeForSuffix,
} from './utils/token.js';
import { Coroutine } from './coroutine.js';
import { buildCall, buildNull } from './transforms.generated.js';
import { Path } from './path.js';
import * as sym from './symbols.js';

export class StateFacade {
  constructor(state) {
    facades.set(state, this);
  }

  get span() {
    return actuals.get(this).span.name;
  }

  get result() {
    return actuals.get(this).result;
  }
}

export class State extends WeakStackFrame {
  constructor(
    context,
    source,
    path,
    balanced = emptyStack,
    spans = emptyStack.push({ name: 'Bare' }),
    result = null,
    emitted = null,
  ) {
    super();

    if (!context || !source) throw new Error('invalid args to tagState');

    this.context = context;
    this.source = source;
    this.path = path;
    this.balanced = balanced;
    this.spans = spans;
    this.result = result;
    this.emitted = emitted;

    new StateFacade(this);
  }

  static from(context, source) {
    const state = new State(context, source, null);

    return state.stack.push(null, state);
  }

  *emit(terminal) {
    const { prevTerminals, nextTerminals, tagPaths } = this.context;

    if (terminal) {
      if (prevTerminals.has(terminal)) {
        throw new Error('Double emit');
      }

      prevTerminals.set(terminal, this.result);
      if (this.result) {
        nextTerminals.set(this.result, terminal);
      }

      this.result = terminal;
    }

    if (!this.emitted && terminal) {
      if (terminal.type !== 'OpenFragmentTag') throw new Error();
      this.emitted = terminal;
      yield buildCall('emit', terminal);
    }

    if (this.depth === 0) {
      let emittable = nextTerminals.get(this.emitted);

      while (
        emittable &&
        !(emittable.type === 'OpenNodeTag' && tagPaths.get(emittable).unboundAttributes?.size)
      ) {
        yield buildCall('emit', emittable);
        this.emitted = emittable;
        emittable = nextTerminals.get(this.emitted);
      }
    }

    return terminal;
  }

  get span() {
    return this.spans.value;
  }

  get stack() {
    return this.context.states;
  }

  get isGap() {
    return this.tag.type === 'NodeGapTag';
  }

  get speculative() {
    return !!this.parent;
  }
}

export function* evaluate(ctx, rootSource, rootMatcher, trampoline) {
  let s = State.from(ctx, rootSource);

  let co = new Coroutine(trampoline(ctx, s, rootMatcher));

  co.advance();

  while (!co.done) {
    const instr = co.value;
    let returnValue = undefined;

    const {
      verb: verbToken,
      verbSuffix: verbSuffixToken,
      arguments: {
        properties: { values: { 0: matcher } = [] },
      },
    } = instr.properties;
    const verb = getCooked(verbToken);
    const verbSuffix = verbSuffixToken && getCooked(verbSuffixToken);

    switch (verb) {
      case 'eat':
      case 'eatMatch':
      case 'match':
      case 'guard': {
        const effects = effectsFor(verb);

        switch (matcher.type) {
          case 'String':
          case 'Pattern': {
            const { source } = s;

            let result = null;

            switch (matcher.type) {
              case 'Pattern': {
                assertValidRegex(matcher);

                [result] = exec(matcher, source);
                break;
              }

              case 'String': {
                const { content } = matcher.properties;

                const pattern = getCooked(content);
                if (startsWithSeq(pattern, source)) {
                  result = pattern;
                }
                break;
              }
            }

            let terminal = null;

            if (result) {
              const type = terminalTypeForSuffix(verbSuffix);
              const raw = result;
              const value =
                type === 'Escape' ? { cooked: ctx.language.cookEscape(raw), raw } : result;

              terminal = freezeSeal({ type, value });

              if (effects.success === sym.eat) {
                s.source.advance(result.length);

                yield* s.emit(terminal);
              }
            }

            returnValue = terminal;
            break;
          }

          case 'Null': {
            const {
              arguments: {
                properties: { values: { 1: path } = [] },
              },
            } = instr.properties;

            const { pathName, pathIsArray } = parsePath(getCooked(path.properties.content));

            if (s.path.range[0] && !s.path.range[1]) {
              const { resolver } = s.path;

              if (
                effects.success === sym.eat &&
                (!pathIsArray || !resolver.counters.has(pathName))
              ) {
                // push the terminals into children

                const refTerminal = buildReferenceTag(pathName, pathIsArray);
                const nullTerminal = buildNull();

                yield* s.emit(refTerminal);
                yield* s.emit(nullTerminal);

                returnValue = nullTerminal;
              } else {
                returnValue = null;
              }
            } else {
              throw new Error();
            }

            break;
          }

          default:
            throw new Error(`Unknown matcher of {type: ${matcher.type}}`);
        }

        break;
      }

      case 'branch': {
        const { context, source, path, balanced, spans, result, emitted } = s;

        returnValue = s = s.push(
          new State(context, source.branch(), path.branch(), balanced, spans, result, emitted),
        );
        break;
      }

      case 'accept':
        const accepted = s;

        s = s.parent;

        if (!s) {
          throw new Error('accepted the root state');
        }

        s.spans = accepted.spans;
        s.balanced = accepted.balanced;

        s.source.accept(accepted.source);
        s.path.accept(accepted.path);

        // emitted isn't used here and probably doesn't need to be part of state

        if (s.depth === 0) {
          yield* s.emit();
        }

        s.result = accepted.result;

        returnValue = s;
        break;

      case 'reject':
        const rejectedState = s;

        ctx.nextTerminals.delete(s.result);

        s = s.parent;

        if (!s) throw new Error('rejected root state');

        if (rejectedState.path.depth > s.path.depth) {
          const lowPath = rejectedState.path.at(
            Math.min(s.path.depth + 1, rejectedState.path.depth),
          );

          const { pathName, pathIsArray } = lowPath?.reference?.value || {};

          if (!s.path.resolver.counters.has(pathName)) {
            yield* s.emit(buildReferenceTag(pathName, pathIsArray));
          }

          if (s.result.type === 'ReferenceTag') {
            yield* s.emit(buildNull());
          }
        }

        rejectedState.source.reject();

        returnValue = s;
        break;

      case 'reference': {
        const {
          arguments: {
            properties: { values: { 0: path } = [] },
          },
        } = instr.properties;
        const { pathName, pathIsArray } = parsePath(path);

        const tag = buildReferenceTag(pathName, pathIsArray);

        s.path.resolver.consume(tag);

        s.path = s.path.pushTag(tag);

        yield* s.emit(tag);

        returnValue = tag;
        break;
      }

      case 'startNode': {
        const {
          arguments: {
            properties: { values: { 0: type, 1: attributes } = [] },
          },
        } = instr.properties;
        const referenceTag = s.result;
        const isFragment = !type;
        const openTag = isFragment ? buildFragmentOpenTag() : buildNodeOpenTag(type, attributes);

        if (!isFragment && referenceTag?.type !== 'ReferenceTag') throw new Error();

        if (isFragment) {
          s.path = new Path(ctx, referenceTag);
        }

        const { balancer } = openTag.value?.attributes || {};

        if (balancer) {
          const balancedPath = s.balanced.value;

          if (!s.balanced.size) throw new Error();

          s.balanced = s.balanced.pop();

          if (balancer && balancedPath.spanBetween) {
            s.spans = s.spans.pop();
          }

          ctx.balancedPaths.set(balancedPath, s.path);
          ctx.balancedPaths.set(s.path, balancedPath);
        }

        s.path.pushTag(openTag);

        ctx.tagPaths.set(openTag, s.path);

        const { spanInside, balanced } = s.path;

        if (balanced) {
          s.balanced = s.balanced.push(s.path);
        }

        if (spanInside) {
          s.spans = s.spans.push({
            type: 'Inner',
            name: spanInside,
            path: s.path,
          });
        }

        yield* s.emit(openTag);

        returnValue = openTag;
        break;
      }

      case 'endNode': {
        const {
          arguments: {
            properties: { values: { 0: type } = [] },
          },
        } = instr.properties;

        const endTag = buildNodeCloseTag(type);

        if (type) {
          const { balanced, spanInside, spanBetween } = s.path;

          if (spanBetween) {
            if (!balanced) throw new Error();

            s.spans = s.spans.push({
              type: 'Lexical',
              name: spanBetween,
              path: s.path,
            });
          }

          if (spanInside) {
            s.spans = s.spans.pop();
          }

          s.path = s.path.pushTag(endTag);
        }

        yield* s.emit(endTag);

        returnValue = endTag;
        break;
      }

      case 'bindAttribute': {
        const {
          arguments: {
            properties: { values: { 0: key, 1: value } = [] },
          },
        } = instr.properties;

        const { unboundAttributes } = s.path;

        const key_ = reifyExpression(key);

        if (!unboundAttributes.has(key_)) {
          throw new Error('No unbound attribute to bind');
        }

        if (s.path.startTag.type === 'OpenFragmentTag') {
          throw new Error();
        }

        if (key_ === 'span') throw new Error('too late');

        if (key_ === 'lexicalSpan') {
          // I don't think lexical spans are currently applied correctly at all
        }

        // if (stateIsDifferent) {
        //   // we can't allow effects to cross state branches
        //   throw new Error();
        // }

        unboundAttributes.delete(key_);

        const value_ = reifyExpression(value);
        const { startTag } = s.path;

        if (value_ != null) {
          const attributes = { ...startTag.value.attributes, [key_]: value_ };
          const newStartTag = buildNodeOpenTag(startTag.value.type, attributes);

          let startNext = ctx.nextTerminals.get(startTag);
          let startPrev = ctx.prevTerminals.get(startTag);

          ctx.prevTerminals.set(newStartTag, startPrev);
          ctx.nextTerminals.set(startPrev, newStartTag);

          ctx.tagPaths.set(newStartTag, s.path);

          if (startNext) {
            ctx.nextTerminals.set(newStartTag, startNext);
            ctx.prevTerminals.set(startNext, newStartTag);
          } else {
            // could this terminal might be stored anywhere else?
            s.result = newStartTag;
          }

          s.path.range[0] = newStartTag;
        }

        // m.range isn't updated yet

        if (!unboundAttributes.size) {
          yield* s.emit();
        }

        returnValue = s.path.range[0];
        break;
      }

      case 'resolve':
        returnValue = yield instr;
        break;

      // case 'emit': {
      //   if (/\r|\n/.test(terminal.value) && !/^\r|\r\n|\n$/.test(terminal.value)) {
      //     throw new Error('Invalid LineBreak token');
      //   }

      //   break;
      // }

      default: {
        throw new Error(`Unexpected call of {type: ${formatType(verb)}}`);
      }
    }

    co.advance(returnValue);
  }
}
