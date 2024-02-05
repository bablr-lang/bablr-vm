import { exec } from '@bablr/regex-vm';
import { Coroutine } from '@bablr/coroutine';
import {
  parsePath,
  getCooked,
  buildReference,
  buildNodeOpenTag,
  buildFragmentOpenTag,
  buildNodeCloseTag,
} from '@bablr/agast-helpers';
import startsWithSeq from 'iter-tools-es/methods/starts-with-seq';
import { effectsFor, reifyExpression, buildNull } from '@bablr/agast-vm-helpers';
import { formatType } from './utils/format.js';
import { assertValidRegex, terminalTypeForSuffix } from './utils/token.js';
import { Path } from './path.js';
import { State } from './state.js';
import { actuals, facades } from './utils/facades.js';

const { freeze } = Object;

export function* runSync(evaluator) {
  let co = new Coroutine(evaluator);

  co.advance();

  while (!co.done) {
    const {
      verb: verbToken,
      arguments: {
        properties: { values: { 0: arg } = [] },
      },
    } = co.value.properties;

    const verb = getCooked(verbToken);

    switch (verb) {
      case 'resolve':
        throw new Error('runSync cannot resolve promises');

      case 'emit':
        yield arg;
        break;

      default:
        throw new Error(`Unexpected call {verb: ${formatType(verb)}}`);
    }

    co.advance(undefined);
  }
}

export async function* runAsync(evaluator) {
  let co = new Coroutine(evaluator);

  co.advance();

  while (!co.done) {
    let returnValue;
    const {
      verb: verbToken,
      arguments: {
        properties: { values: { 0: arg } = [] },
      },
    } = co.value.properties;

    const verb = getCooked(verbToken);

    switch (verb) {
      case 'resolve':
        returnValue = await arg;
        break;

      case 'emit':
        yield arg;
        break;

      default:
        throw new Error();
    }

    co.advance(returnValue);
  }
}

export function evaluate(ctxFacade, rootSourceFacade, generator) {
  const ctx = actuals.get(ctxFacade);
  const rootSource = actuals.get(rootSourceFacade);

  if (ctxFacade && !ctx) throw new Error();
  if (rootSourceFacade && !rootSource) throw new Error();

  return __evaluate(ctx, rootSource, generator);
}

function* __evaluate(ctx, rootSource, generator) {
  let s = State.from(ctx, rootSource);

  let co = new Coroutine(generator);

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

              terminal = freeze({ type, value });

              if (effects.success === 'eat') {
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

              if (effects.success === 'eat' && (!pathIsArray || !resolver.counters.has(pathName))) {
                // push the terminals into children

                const refTerminal = buildReference(pathName, pathIsArray);
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

        s = s.push(
          new State(context, source.branch(), path.branch(), balanced, spans, result, emitted),
        );

        returnValue = facades.get(s);
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

        returnValue = facades.get(s);
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
            yield* s.emit(buildReference(pathName, pathIsArray));
          }

          if (s.result.type === 'Reference') {
            yield* s.emit(buildNull());
          }
        }

        rejectedState.source.reject();

        returnValue = facades.get(s);
        break;

      case 'reference': {
        const {
          arguments: {
            properties: { values: { 0: path } = [] },
          },
        } = instr.properties;
        const { pathName, pathIsArray } = parsePath(path);

        const tag = buildReference(pathName, pathIsArray);

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
        const reference = s.result;
        const isFragment = !type;
        const openTag = isFragment ? buildFragmentOpenTag() : buildNodeOpenTag(type, attributes);

        if (!isFragment && reference?.type !== 'Reference') throw new Error();

        if (isFragment) {
          s.path = new Path(ctx, reference);
        }

        const { balancer } = openTag.value?.attributes || {};

        if (balancer) {
          const balancedPath = s.balanced.value;

          if (!s.balanced.size) throw new Error();

          s.balanced = s.balanced.pop();

          if (balancer && balancedPath.spanBetween) {
            s.spans = s.spans.pop();
          }
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
        }

        s.path = s.path.pushTag(endTag);

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

      case 'getState': {
        returnValue = facades.get(s);
        break;
      }

      case 'getContext': {
        returnValue = facades.get(ctx);
        break;
      }

      default: {
        throw new Error(`Unexpected call of {type: ${formatType(verb)}}`);
      }
    }

    co.advance(returnValue);
  }
}

export const evaluateSync = (...args) => runSync(evaluate(...args));
export const evaluateAsync = (...args) => runAsync(evaluate(...args));
