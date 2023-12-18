import { exec } from '@bablr/regex-vm';
import startsWithSeq from 'iter-tools-es/methods/starts-with-seq';
import emptyStack from '@iter-tools/imm-stack';
import { facades, actuals } from './utils/facades.js';
import { formatType } from './utils/format.js';
import { effectsFor, parsePath } from './utils/instruction.js';
import { WeakStackFrame, freezeSeal } from './utils/object.js';
import {
  assertValidRegex,
  getCooked,
  buildReferenceTag,
  buildNodeOpenTag,
  buildFragmentNodeOpenTag,
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

  get isTerminal() {
    return actuals.get(this).isTerminal;
  }
}

export class State extends WeakStackFrame {
  constructor(context, source, path, spans = emptyStack.push({ name: 'Bare' }), result = null) {
    super();

    if (!context || !source) throw new Error('invalid args to tagState');

    this.context = context;
    this.source = source;
    this.path = path;
    this.spans = spans;
    this.result = result;

    new StateFacade(this);
  }

  static from(context, source) {
    const state = new State(context, source, null);

    return state.stack.push(null, state);
  }

  emit(terminal) {
    const { prevTerminals } = this.context;

    if (prevTerminals.has(terminal)) {
      throw new Error('Double emit');
    }

    prevTerminals.set(terminal, this.result);
    this.result = terminal;

    return terminal;
  }

  get span() {
    return this.spans.value;
  }

  get stack() {
    return this.context.states;
  }

  get isTerminal() {
    return this.path.isTerminal;
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
                s.emit(terminal);

                if (verbSuffix !== '#' && !s.isTerminal) {
                  throw new Error('Attempted to match literal outside terminal node');
                }

                s.source.advance(result.length);

                if (s.depth === 0) {
                  yield buildCall('emit', terminal);
                }
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

                s.emit(refTerminal);
                s.emit(nullTerminal);

                if (!s.depth) {
                  yield buildCall('emit', refTerminal);
                  yield buildCall('emit', nullTerminal);
                }
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
        const { context, source, path, spans, result } = s;

        returnValue = s = s.push(new State(context, source.branch(), path.branch(), spans, result));
        break;
      }

      case 'accept':
        const accepted = s;

        s = s.parent;

        if (!s) {
          throw new Error('accepted the root state');
        }

        s.spans = accepted.spans;

        s.source.accept(accepted.source);
        s.path.accept(accepted.path);

        if (s.depth === 0) {
          if (s.result.type === 'Reference') {
            yield buildCall('emit', s.result);
          }
          for (const terminal of [...ctx.allTerminalsReverseFor([s.result, accepted.result])]
            .reverse()
            .slice(1)) {
            yield buildCall('emit', terminal);
          }
        }

        s.result = accepted.result;

        returnValue = s;
        break;

      case 'reject':
        const rejectedState = s;

        if (s.path.range[0] && !s.path.range[1]) {
          const lowPath = s.path.at(Math.min(s.parent.path.depth + 1, s.path.depth));

          const { pathName, pathIsArray } = lowPath?.reference?.value || {};

          if (
            pathName &&
            s.parent.result.type === 'Reference' &&
            (!pathIsArray || !lowPath.parent.resolver.counters.has(pathName))
          ) {
            yield buildCall('emit', lowPath.reference);
            yield buildCall('emit', buildNull());
          }
        }

        s = s.parent;

        rejectedState.source.reject();

        returnValue = s;
        break;

      case 'resolve':
        returnValue = yield instr;
        break;

      case 'reference': {
        const {
          arguments: {
            properties: { values: { 0: path } = [] },
          },
        } = instr.properties;
        const { pathName, pathIsArray } = parsePath(path);

        const tag = buildReferenceTag(pathName, pathIsArray);

        if (pathIsArray) {
          s.path.resolver.consume(tag);
        }

        s.emit(tag);

        returnValue = tag;
        break;
      }

      case 'startNode': {
        const {
          arguments: {
            properties: { values: { 0: type, 1: attributes, 2: isTerminalNode = false } = [] },
          },
        } = instr.properties;

        const referenceTag = s.result;
        const tag = type ? buildNodeOpenTag(type, attributes) : buildFragmentNodeOpenTag();

        const { lexicalSpan, span } = tag.value?.attributes || {};

        if (referenceTag && referenceTag.type !== 'Reference') throw new Error();

        if (span && lexicalSpan) throw new Error();

        if (lexicalSpan || span) {
          const type = lexicalSpan ? 'Lexical' : 'Inner';
          s.spans = s.spans.push({ type, name: lexicalSpan || span, startTag: tag, endTag: null });
        }

        s.emit(tag);

        if (s.path) {
          s.path = s.path.pushTag(referenceTag, isTerminalNode);
        } else {
          s.path = new Path(ctx, referenceTag);
        }
        s.path.pushTag(tag);

        if (s.depth === 0) {
          if (referenceTag) {
            yield buildCall('emit', referenceTag);
          }
          yield buildCall('emit', tag);
        }

        returnValue = tag;
        break;
      }

      case 'endNode': {
        const {
          arguments: {
            properties: { values: { 0: type } = [] },
          },
        } = instr.properties;

        const endTag = buildNodeCloseTag(type);

        if (s.path) {
          const startTag = s.path.range[0];

          const { balancer, span } = startTag.value?.attributes || {};

          if (
            (s.span.type === 'Inner' && span) ||
            (s.span.type === 'Lexical' && balancer && s.span.startTag.value.attributes.lexicalSpan)
          ) {
            s.span.endTag = endTag;
            s.spans = s.spans.pop();
          }

          s.path = s.path.pushTag(endTag);

          if (s.depth === 0) {
            yield buildCall('emit', endTag);
          }
        }

        s.emit(endTag);

        returnValue = endTag;
        break;
      }

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
