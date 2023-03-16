import regexEscape from 'escape-string-regexp';
import { parse as parseRegex, exec } from '@iter-tools/regex';

import { formatType } from './utils/format.js';
import { facades } from './utils/facades.js';
import { isString } from './utils/object.js';
import { finalizeStatus, finalizeCoroutine } from './utils/state.js';
import { createToken, assertValidRegex } from './utils/token.js';
import { Coroutine } from './coroutine.js';
import * as sym from './symbols.js';
import {
  _actual,
  none,
  defer,
  eat,
  match,
  eatMatch,
  fail,
  active,
  suspended,
  rejected,
  startToken,
  endToken,
} from './symbols.js';
import emptyStack from '@iter-tools/imm-stack';

export function tokenize(context, initialState, type, value, verb) {
  const ctx = context;
  const { tokenGrammar: grammar, prevTokens, ranges } = ctx;
  let debug_ = false;
  let s = initialState;

  if (!grammar.aliases.has('Token')) {
    throw new Error('A Token alias is required');
  }

  const previousToken = s.result;

  s.status = active;

  if (verb !== eat) {
    s = s.branch();
  }

  s.coroutines = s.coroutines.push(
    Coroutine.from(
      grammar,
      type,
      {
        context: facades.get(context),
        state: facades.get(s),
        lexicalContext: s.lexicalContext,
        value,
      },
      verb,
    ),
  );

  prevTokens.set(s.co, s.result);

  for (;;) {
    while (s.status === active && !s.co.done) {
      // The production generator has just yielded an instruction
      const { value: instr } = s.co;
      const { error: cause } = instr;

      let returnValue = none;

      if (debug_) {
        debug_ = false;
        debugger;
      }

      switch (instr.type) {
        case match:
        case eatMatch:
        case eat: {
          const matchable = instr.value;

          switch (matchable.type) {
            case sym.token: {
              const { type, props } = matchable.value;
              const isMeta = grammar.is('Token', type);

              if (instr.type !== eat) {
                s = s.branch(); // nested state
              }

              // don't create empty matchState if isMeta is true

              s.coroutines = s.coroutines.push(
                Coroutine.from(
                  grammar,
                  type,
                  {
                    ...props,
                    lexicalContext: s.lexicalContext,
                    context: facades.get(context),
                    state: facades.get(s),
                  },
                  instr.type,
                ),
              );

              prevTokens.set(s.co, s.result);

              returnValue = defer;
              break;
            }

            case sym.character: {
              let pattern = matchable.value;

              if (pattern === sym.EOF) {
                returnValue = s.source.done ? sym.EOF : null;
                break;
              }

              if (isString(pattern)) {
                pattern = new RegExp(regexEscape(pattern), 'y');
              }

              assertValidRegex(pattern);

              const [result] = exec(parseRegex(pattern), s.source);

              if (result) {
                if (instr.type !== match) {
                  s.match.value += result;
                  s.source.advance(result.length);
                }
              } else {
                if (instr.type === eat) {
                  s.reject();
                }
              }

              returnValue = result;
              break;
            }

            default:
              throw new Error('matchable.type must be sym.token or sym.chrs');
          }

          break;
        }

        case startToken: {
          if (s.match) {
            throw new Error('A token is already started');
          }

          const type = instr.value;

          if (!type) {
            throw new Error();
          }

          s.match = { type, value: '' };

          returnValue = undefined;
          break;
        }

        case endToken: {
          if (!s.match) {
            throw new Error('No token is started');
          }

          const { type, value } = s.match;

          if (!value) {
            throw new Error('Invalid token');
          }

          if (/\r|\n/.test(value) && !/^\r|\r\n|\n$/.test(value)) {
            throw new Error('Invalid LineBreak token');
          }

          const token = createToken(type, value);

          prevTokens.set(token, s.result);
          s.result = token;
          s.match = null;

          returnValue = token;
          break;
        }

        case fail: {
          s.reject();

          s.co.return();

          returnValue = null;
          break;
        }

        case 'debug': {
          debug_ = true;

          returnValue = undefined;
          break;
        }

        default:
          throw new Error(
            `Unexpected Instruction of {type: ${formatType(instr.type)}}`,
            cause && { cause },
          );
      }

      if (returnValue === none) {
        throw new Error('cst-tokens: unanticipated case: returnValue is none');
      } else if (s.status === rejected) {
        break;
      } else if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!s.co.done) {
        s.co.advance(returnValue);
      }
    }

    // resume suspended execution

    {
      const finishedCo = s.co;
      const range = ctx.getRangeFromPreviousAndFinal(prevTokens.get(finishedCo), s.result);

      if (range) {
        ranges.set(finishedCo, range);
      }

      finalizeStatus(s, range);
      finalizeCoroutine(s);

      if (s.coroutines.size > 1) {
        if (range && finishedCo.verb === eat) {
          s.coroutines = s.coroutines.pop();
          s.match = null;
        } else {
          s = s.parent;
        }

        s.status = active;
        s.co.advance(range);

        continue;
      } else {
        break;
      }
    }
  }

  const range = ctx.getRangeFromPreviousAndFinal(previousToken, s.result);

  if (range && verb === eat) {
    s.coroutines = emptyStack;
  } else {
    s = s.parent;
  }

  if (s !== initialState) throw new Error();

  s.status = suspended;
  s.match = null;

  return range;
}
