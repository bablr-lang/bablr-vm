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
  const { tokenGrammar: grammar, prevTokens } = ctx;
  let debug_ = false;
  let s = initialState;
  const getState = () => facades.get(s);

  if (!grammar.aliases.has('Token')) {
    throw new Error('A Token alias is required');
  }

  const previousToken = s.token;

  s.status = active;

  s.coroutines = s.coroutines.push(
    Coroutine.from(grammar, type, {
      context: facades.get(context),
      getState,
      lexicalContext: s.lexicalContext,
      value,
    }),
  );

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

              returnValue = defer;
              break;
            }

            case sym.character: {
              const matchSource = s.source.branch();
              let pattern = matchable.value;

              if (pattern === sym.EOF) {
                returnValue = matchSource.done ? sym.EOF : null;
                break;
              }

              if (isString(pattern)) {
                pattern = new RegExp(regexEscape(pattern), 'y');
              }

              assertValidRegex(pattern);

              const [result] = exec(parseRegex(pattern), matchSource);

              matchSource.release();

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

    finalizeStateStatus(s);

    let result;

    const resumingCoroutine = s.coroutines.prev?.value;

    if (resumingCoroutine) {
      const suspendingCommand = resumingCoroutine.value;

      if (s.status === accepted) {
        if (!s.match.token) throw new Error('No result: token did not end');

        const { token } = s.match;

        if (suspendingCommand.type === eat) {
          s.coroutines = s.coroutines.pop();
          s.match = null;
        } else {
          s = s.accept();
        }

        result = token;
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

        result = null;
      } else {
        throw new Error();
      }

      if (s.status === active) {
        s.co.advance(result);
      }
    } else {
      break;
    }
  }

  if (s.depth !== 0) throw new Error();

  if (s.status !== accepted && s.status !== rejected) throw new Error();

  const finalToken = s.token;

  s.status = suspended;
  s.coroutines = emptyStack;

  return ctx.getRangeFromPreviousAndFinal(previousToken, finalToken);
}
