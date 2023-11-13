import { exec } from '@bablr/regex-vm';
import startsWithSeq from 'iter-tools-es/methods/starts-with-seq';
import emptyStack from '@iter-tools/imm-stack';

import { formatType } from './utils/format.js';
import { effectsFor } from './utils/instruction.js';
import { WeakStackFrame, freezeSeal } from './utils/object.js';
import { assertValidRegex, getCooked } from './utils/token.js';
import { Coroutine } from './coroutine.js';
import { buildNodeOpenTag } from './transforms.generated.js';
import * as sym from './symbols.js';

export class State extends WeakStackFrame {
  constructor(
    context,
    source,
    spans = emptyStack.push('Bare'),
    result = buildNodeOpenTag(sym.File),
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

            if (result) {
              if (effects.success === sym.eat) {
                s.terminals.push(freezeSeal({ type: 'Literal', value: result }));
                s.source.advance(result.length);
              }
            } else {
              if (effects.failure === sym.fail) {
                s.terminals = null;
              }
            }

            returnValue = result;
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
        s.result = accepted.result;
        s.spans = accepted.spans;

        s.source.accept(accepted.source);

        returnValue = s;
        break;

      case 'reject':
        s.source.reject();

        returnValue = s = s.parent;
        break;

      case 'resolve':
        returnValue = yield instr;
        break;

      case 'emit': {
        const { prevTags } = ctx;
        const tag = instr.value;
        let { result } = s;

        if (tag.type === 'TerminalNodeTag') {
          if (s.terminals) {
            if (/\r|\n/.test(s.terminals) && !/^\r|\r\n|\n$/.test(s.terminals)) {
              throw new Error('Invalid LineBreak token');
            }
          }

          s.terminals = null;
        }

        prevTags.set(tag, result);

        s.result = result = tag;

        yield instr;
        break;
      }

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
