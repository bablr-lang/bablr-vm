import escapeRegex from 'escape-string-regexp';
import { exec, parse as parseRegex } from '@iter-tools/regex';

import { formatType } from './utils/format.js';
import { validateInstruction, shouldBranch } from './utils/instruction.js';
import { createTokenTag } from './utils/token.js';
import { emit } from './utils/dispatcher.js';
import { Match } from './match.js';
import { TagState } from './state.js';
import { Coroutine } from './coroutine.js';
import { Path } from './path.js';
import * as sym from './symbols.js';

const defer = Symbol('defer');

export function* dispatcher(ctx, rootSource, rootMatchable, trampoline) {
  let m = null;
  let s = null;

  let co = new Coroutine(trampoline);

  co.advance();

  for (;;) {
    while (!co.done) {
      const instr = validateInstruction(co.value);
      let returnValue = undefined;

      switch (instr.type) {
        case sym.init: {
          const path = Path.from(ctx, rootMatchable);
          const state = TagState.from(ctx, path, rootSource);
          m = Match.from(ctx, state, rootMatchable);
          ({ s } = m);

          m.precedingTag = s.result;

          s.status = sym.active;

          returnValue = m;
          break;
        }

        // Creates a stack frame, also known as a match
        case sym.dispatch: {
          const { matchable } = instr.value;

          // what about aliases.has(type)?
          //   i.e. disambiguation productions
          //   which should get a GapTag

          m = m.exec(instr.value);
          ({ s } = m);

          m.precedingTag = s.result;

          s.status = sym.active;

          returnValue = m;
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

        case sym.accept: {
          const { grammar } = m;
          const { prevTags } = ctx;
          let nextMatch;

          switch (m.grammarType) {
            case sym.node: {
              if (grammar.is('Node', m.production)) {
                // This definitely cannot be here
                // parse needs to send it, because traverse will!!
                const finalTag = {
                  type: 'CloseTag',
                  value: { type: completedMatch.tag.type },
                };

                prevTags.set(finalTag, s.result);

                if (!s.speculative) {
                  yield emit(finalTag);
                }

                s.result = finalTag;
                m.finalTag = finalTag;
                m.capture();
              }
              break;
            }

            case sym.token: {
              if (grammar.is('Token', m.tag.type)) {
                if (!s.match) throw new Error('No token is started');

                if (s.match.value) {
                  const { type, value } = s.match;

                  if (/\r|\n/.test(value) && !/^\r|\r\n|\n$/.test(value)) {
                    throw new Error('Invalid LineBreak token');
                  }

                  const tag = createTokenTag(type, value);

                  prevTags.set(tag, s.result);

                  if (!s.speculative) {
                    yield emit(tag);
                  }

                  s.match = null;
                  s.result = tag;
                  m.finalTag = tag;
                  m.capture();
                }
              }
              break;
            }

            default: {
              m.finalTag = s.result;
              m.capture();
            }
          }

          m = m.terminate();

          if (m) {
            ({ s } = m);

            s.status = sym.active;
            m.co.advance(m.empty ? null : [m.startTag, m.finalTag]);
          } else {
            throw new Error('OK OK OK');
            // return;
          }

          returnValue = m;
          break;
        }

        case sym.reject: {
          m.reject();
          returnValue = null;
          break;
        }

        case sym.resolve: {
          returnValue = yield instr;
          break;
        }

        case sym.emit: {
          const { prevTags } = ctx;
          const tag = instr.value;
          let { result } = m;

          prevTags.set(tag, result);

          m.result = result = tag;

          yield instr;
          break;
        }

        default:
          throw new Error(`Unexpected instruction of {type: ${formatType(instr.type)}}`);
      }

      if (m.s.status === sym.rejected) {
        break;
      }

      if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!co.done) {
        co.advance(returnValue);
      }
    }

    if (m.size === 1) return;

    const completedMatch = m;

    m = m.parent;

    if (m) {
      ({ s } = m);

      const { effects } = m;
      const returnValue = completedMatch.empty ? null : completedMatch;

      // do I still need this?
      if (returnValue && effects.success === sym.reject) {
        m.terminate();
      }

      if (
        returnValue &&
        shouldBranch(completedMatch.effects) &&
        completedMatch.effects.success === sym.eat
      ) {
        m.state.states
          .get(completedMatch.grammar)
          .accept(completedMatch.state.get(completedMatch.grammar));
      } else if (!returnValue && completedMatch.effects.success === sym.reject) {
        // TODO
      }

      co.advance(returnValue);
    } else {
      return;
    }
  }
}
