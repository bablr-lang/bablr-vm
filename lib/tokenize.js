import regexEscape from 'escape-string-regexp';
import { parse as parseRegex, exec } from '@iter-tools/regex';

import { formatType } from './utils/format.js';
import { facades } from './utils/facades.js';
import { isString } from './utils/object.js';
import { finalizeStateStatus } from './utils/status.js';
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
  accepted,
  rejected,
  startToken,
  endToken,
} from './symbols.js';
import emptyStack from '@iter-tools/imm-stack';

export function tokenize(context, initialState, type, value) {
  const ctx = context;
  const { tokenGrammar: grammar, prevTokens, ranges } = ctx;
  let debug_ = false;
  let s = initialState;
  const getState = () => facades.get(s);

  if (!grammar.aliases.has('Token')) {
    throw new Error('A Token alias is required');
  }

  const previousToken = s.result;

  s.status = active;

  s.coroutines = s.coroutines.push(
    Coroutine.from(grammar, type, {
      context: facades.get(context),
      getState,
      lexicalContext: s.lexicalContext,
      value,
    }),
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
                Coroutine.from(grammar, type, {
                  ...props,
                  context: facades.get(context),
                  getState,
                }),
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

          s.match = { type, value: '', token: null };

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
          s.match.token = token;

          returnValue = token;
          break;
        }

        case fail: {
          s.reject();

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

      if (s.status !== active) {
        break;
      }

      if (returnValue === none) {
        throw new Error('cst-tokens: unanticipated case: returnValue is none');
      } else if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!s.co.done) {
        s.co.advance(returnValue);
      }
    }

    // a production has terminated

    {
      const finishedCo = s.co;
      const resumingCo = s.coroutines.prev?.value;
      const range = ctx.getRangeFromPreviousAndFinal(prevTokens.get(finishedCo), s.result);

      finalizeStateStatus(s, range);

      // sometimes finishedCo is resumingCo!
      // e.g. both are Separator
      // the first run through the same thing there is only one Separator on the stack
      // WHY?

      if (resumingCo) {
        const suspendingCommand = resumingCo.value;

        if (s.status === accepted) {
          ranges.set(finishedCo, range);

          if (suspendingCommand.type === eat) {
            s.coroutines = s.coroutines.pop();
            s.match = null;
          } else {
            s = s.accept();
          }
        } else if (s.status === rejected) {
          if (suspendingCommand.type !== eat && suspendingCommand.value.type !== sym.character) {
            // what if we are in a branch that does not change coroutine? Can this ever happen?
            s = s.parent;
          } else {
            s.coroutines = s.coroutines.pop();
            s.match = null;
          }

          if (!s.co.done && suspendingCommand.type !== eat) {
            s.status = active;
          }
        } else {
          throw new Error();
        }

        if (s.status === active) {
          s.co.advance(range);
        }
        continue;
      } else {
        break;
      }
    }
  }

  if (s !== initialState) throw new Error();

  if (s.status !== accepted && s.status !== rejected) throw new Error();

  s.status = suspended;
  s.match = null;
  s.coroutines = emptyStack;

  return ctx.getRangeFromPreviousAndFinal(previousToken, s.result);
}
