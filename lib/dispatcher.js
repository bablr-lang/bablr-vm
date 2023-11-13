import { exec } from '@bablr/regex-vm';
import startsWithSeq from 'iter-tools-es/methods/starts-with-seq';

import { formatType } from './utils/format.js';
import { validateInstruction, effectsFor } from './utils/instruction.js';
import { assertValidRegex, getCooked } from './utils/token.js';
import { Match } from './match.js';
import { TagState } from './state.js';
import { Coroutine } from './coroutine.js';
import { Path } from './path.js';
import * as sym from './symbols.js';

export function* dispatcher(ctx, rootSource, rootMatchable, trampoline) {
  const rootState = TagState.from(ctx, Path.from(ctx, rootMatchable), rootSource);
  let m = Match.from(ctx, rootState, rootMatchable);
  let { s } = m;

  m.precedingTag = s.result;

  let co = new Coroutine(trampoline(ctx, m));

  co.advance();

  while (!co.done) {
    const instr = validateInstruction(co.value);
    let returnValue = undefined;

    if (instr.language !== 'Instruction') {
      throw new Error('Not an instruction');
    }

    switch (instr.type) {
      case 'Call': {
        const {
          verb: verbToken,
          arguments: {
            properties: { values: { 0: matchable } = [] },
          },
        } = instr.properties;
        const verb = getCooked(verbToken);

        switch (verb) {
          case 'eat':
          case 'eatMatch':
          case 'match':
          case 'guard': {
            const effects = effectsFor(verb);

            switch (matchable.type) {
              case 'String':
              case 'Pattern': {
                const chrState = s.chrState;
                const { source } = chrState;

                let result = null;

                switch (matchable.type) {
                  case 'Pattern': {
                    assertValidRegex(matchable);

                    [result] = exec(matchable, source);
                    break;
                  }

                  case 'String': {
                    const { content } = matchable.properties;

                    const pattern = getCooked(content);
                    if (startsWithSeq(pattern, source)) {
                      result = pattern;
                    }
                    break;
                  }
                }

                if (result) {
                  if (effects.success === sym.eat) {
                    chrState.match += result;
                    chrState.source.advance(result.length);
                  }
                } else {
                  if (effects.failure === sym.fail) {
                    chrState.match = null;
                    m.terminate();
                  }
                }

                returnValue = result;
                break;
              }

              default:
                throw new Error(`Unknown matchable of {type: ${matchable.type}}`);
            }

            break;
          }

          case 'resolve': {
            returnValue = yield instr;
            break;
          }

          case 'emit': {
            const { prevTags } = ctx;
            const tag = instr.value;
            let { result } = m.s;

            prevTags.set(tag, result);

            m.s.result = result = tag;

            yield instr;
            break;
          }

          case 'disambiguate': {
            const cases = instr.value;

            returnValue = null;

            // TODO integrate with regex to match all patterns at once
            for (let [matchable, pattern] of cases) {
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
                returnValue = matchable;
                break;
              }
            }

            break;
          }

          // Creates a stack frame, also known as a match
          case 'dispatch': {
            const {
              arguments: {
                properties: { values: { 0: effects, 1: matchable, 2: props } = [] },
              } = [],
            } = instr.properties;

            m = m.exec(matchable, getCooked(effects.properties.content), props);
            ({ s } = m);

            returnValue = m;
            break;
          }

          case 'terminate': {
            const range = m.capture();

            m = m.terminate();

            if (m) {
              ({ s } = m);

              returnValue = m;
              break;
            } else {
              throw new Error('I think we are done?');
            }
          }

          default: {
            throw new Error(`Unexpected call of {type: ${formatType(verb)}}`);
          }
        }

        break;
      }

      default:
        throw new Error(`Unexpected instruction of {type: ${formatType(instr.type)}}`);
    }

    co.advance(returnValue);
  }
}
