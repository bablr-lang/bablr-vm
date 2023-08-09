import escapeRegex from 'escape-string-regexp';
import { exec, parse as parseRegex } from '@iter-tools/regex';

import { formatType } from './utils/format.js';
import { validateInstruction, shouldBranch } from './utils/instruction.js';
import { assertValidRegex } from './utils/token.js';
import { isString } from './utils/object.js';
import { Match } from './match.js';
import { TagState } from './state.js';
import { Coroutine } from './coroutine.js';
import { Path } from './path.js';
import * as sym from './symbols.js';

const defer = Symbol('defer');

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

    switch (instr.type) {
      case sym.match: {
        const { matchable, effects } = instr.value;
        switch (matchable.type) {
          case 'StringPattern':
          case 'RegexPattern': {
            if (effects.success === sym.eat && (m.grammarType !== sym.token || s.match == null)) {
              throw new Error('Grammar must not eat characters outside a token');
            }

            const chrState = m.grammarType === sym.token ? s : s.chrState;

            let pattern = matchable.value;

            if (isString(pattern)) {
              pattern = new RegExp(escapeRegex(pattern), 'y');
            }

            assertValidRegex(pattern);

            const [result] = exec(parseRegex(pattern), chrState.source);

            if (result) {
              if (effects.success === sym.eat) {
                chrState.match += result;
                chrState.source.advance(result.length);
              }
            } else {
              if (effects.failure === sym.reject) {
                chrState.match = null;
                m.terminate();
              }
            }
            returnValue = result;
            break;
          }
          default:
            throw new Error();
        }
        break;
      }

      case sym.resolve: {
        returnValue = yield instr;
        break;
      }

      case sym.emit: {
        const { prevTags } = ctx;
        const tag = instr.value;
        let { result } = m.s;

        prevTags.set(tag, result);

        m.s.result = result = tag;

        yield instr;
        break;
      }

      case sym.disambiguate: {
        const cases = instr.value;

        returnValue = null;

        // TODO integrate with regex to match all patterns at once
        for (let [matchable, pattern] of cases) {
          let result;
          switch (pattern.type) {
            case 'StringPattern': {
              const re = parseRegex(escapeRegex(pattern.value), 'y');
              [result] = exec(re, s.source);
              break;
            }
            case 'RegexPattern': {
              [result] = exec(parseRegex(pattern.value), s.source);
              break;
            }
          }

          if (result) {
            returnValue = matchable;
            break;
          }
        }

        break;
      }

      // Creates a stack frame, also known as a match
      case sym.dispatch: {
        m = m.exec(instr.value, s);
        ({ s } = m);

        returnValue = m;
        break;
      }

      case sym.terminate: {
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

      default:
        throw new Error(`Unexpected instruction of {type: ${formatType(instr.type)}}`);
    }

    co.advance(returnValue);
  }
}
