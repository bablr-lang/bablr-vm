import { exec } from '@bablr/regex-vm';
import startsWithSeq from 'iter-tools-es/methods/starts-with-seq';
import arrayLast from 'iter-tools-es/methods/array-last';
import emptyStack from '@iter-tools/imm-stack';

import { formatType } from './utils/format.js';
import { effectsFor } from './utils/instruction.js';
import { WeakStackFrame, freezeSeal } from './utils/object.js';
import { assertValidRegex, getCooked, buildNodeOpenTag, buildNodeCloseTag } from './utils/token.js';
import { Coroutine } from './coroutine.js';
import { buildCall } from './transforms.generated.js';
import * as sym from './symbols.js';

export class State extends WeakStackFrame {
  constructor(
    context,
    source,
    spans = emptyStack.push('Bare'),
    result = buildNodeOpenTag(sym.Document),
  ) {
    super();

    if (!context || !source) throw new Error('invalid args to tagState');

    this.context = context;
    this.result = result;
    this.source = source;
    this.spans = spans;

    this.terminals = null;
  }

  static from(context, source) {
    const state = new State(context, source);

    return state.stack.push(null, state);
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
      arguments: {
        properties: { values: { 0: matcher } = [] },
      },
    } = instr.properties;
    const verb = getCooked(verbToken);

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
              terminal = freezeSeal({ type: 'Literal', value: result });
              if (effects.success === sym.eat) {
                if (s.terminals) {
                  ctx.prevTerminals.set(terminal, s.result);

                  s.result = terminal;
                  s.terminals.push(terminal);
                } else {
                  throw new Error('Attempted to match literal outside terminal node');
                }
                s.source.advance(result.length);

                if (s.depth === 0) {
                  yield buildCall('emit', terminal);
                }
              }
            } else {
              if (effects.failure === sym.fail) {
                s.terminals = null;
              }
            }

            returnValue = terminal;
            break;
          }

          default:
            throw new Error(`Unknown matcher of {type: ${matcher.type}}`);
        }

        break;
      }

      case 'branch': {
        const { context, source, spans, result } = s;

        returnValue = s = s.push(new State(context, source.branch(), spans, result));
        break;
      }

      case 'accept':
        const accepted = s;

        s = s.parent;
        s.spans = accepted.spans;

        s.source.accept(accepted.source);

        if (s.depth === 0) {
          let terminal = s.result;
          while ((terminal = ctx.nextTerminals.get(terminal))) {
            yield buildCall('emit', terminal);
            s.result = terminal;
          }
        }

        returnValue = s;
        break;

      case 'reject':
        s.source.reject();

        returnValue = s = s.parent;
        break;

      case 'resolve':
        returnValue = yield instr;
        break;

      case 'startNode': {
        const {
          arguments: {
            properties: { values: { 0: type, 1: path, 2: attributes } = [] },
          },
        } = instr.properties;

        const terminal = buildNodeOpenTag(type, path, attributes);

        ctx.prevTerminals.set(terminal, s.result);

        s.result = terminal;

        if (s.depth === 0) {
          yield buildCall('emit', terminal);
        }

        returnValue = terminal;
        break;
      }

      case 'endNode': {
        const {
          arguments: {
            properties: { values: { 0: type } = [] },
          },
        } = instr.properties;

        const terminal = buildNodeCloseTag(type);

        ctx.prevTerminals.set(terminal, s.result);

        s.result = terminal;

        if (s.depth === 0) {
          yield buildCall('emit', terminal);
        }

        returnValue = terminal;
        break;
      }

      // case 'emit': {
      //   const {
      //     arguments: {
      //       properties: { values: { 0: terminal } = [] },
      //     },
      //   } = instr.properties;

      //   if (s.depth !== 0) {
      //     throw new Error('Cannot emit during speculative matching');
      //   }

      //   if (/\r|\n/.test(terminal.value) && !/^\r|\r\n|\n$/.test(terminal.value)) {
      //     throw new Error('Invalid LineBreak token');
      //   }

      //   break;
      // }

      // Move this down a layer?
      case 'disambiguate': {
        const cases = instr.value;

        returnValue = null;

        // TODO integrate with regex to match all patterns at once
        for (let [matcher, pattern] of cases) {
          let result;
          switch (pattern.type) {
            case 'String': {
              const { value } = pattern.value;

              result = startsWithSeq(value, s.source) ? value : null;
              break;
            }

            case 'Regex': {
              const { value } = pattern.value;

              [result] = exec(value, s.source);
              break;
            }

            default:
              throw new Error();
          }

          if (result) {
            returnValue = matcher;
            break;
          }
        }

        break;
      }

      default: {
        throw new Error(`Unexpected call of {type: ${formatType(verb)}}`);
      }
    }

    co.advance(returnValue);
  }
}
