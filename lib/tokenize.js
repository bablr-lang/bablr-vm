import regexEscape from 'escape-string-regexp';
import { parse as parseRegex, exec } from '@iter-tools/regex';

import { formatType } from './utils/format.js';
import { facades } from './utils/facades.js';
import { createToken } from './utils/token.js';
import { Coroutine } from './coroutine.js';
import * as sym from './symbols.js';
import {
  _actual,
  none,
  defer,
  eat,
  match,
  eatMatch,
  rejected,
  startToken,
  endToken,
} from './symbols.js';

export function tokenize(context, s, type, value) {
  const { tokenGrammar: grammar, prevTokensByToken } = context;
  let debug_ = false;
  const getState = () => facades.get(s);

  if (!grammar.aliases.has('Token')) {
    throw new Error('A Token alias is required');
  }

  const { lexicalContext } = s;
  const props = { getState, lexicalContext, value };

  s.coroutines = s.coroutines.push(Coroutine.from(grammar, type, props));

  for (;;) {
    while (!s.co.done) {
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
          const edible = instr.value;

          if (instr.type !== eat) {
            s = s.branch(); // nested state
          }

          switch (edible.type) {
            case sym.production: {
              const { type, props } = instr.value;
              const isMeta = grammar.is('Token', type);

              // don't create empty matchState if isMeta is true

              s.coroutines = s.coroutines.push(
                Coroutine.from(grammar, type, {
                  ...props,
                  getState,
                }),
              );

              returnValue = defer;
              break;
            }
            case sym.terminal: {
              const matchSource = s.source.branch();
              let pattern = instr.value;

              if (pattern === sym.EOF) {
                returnValue = matchSource.done ? sym.EOF : null;
                break;
              }

              if (typeof pattern === 'string') {
                pattern = new RegExp(regexEscape(pattern), 'y');
              }

              if (!(pattern instanceof RegExp)) {
                throw new Error('Unsupported pattern');
              }

              if (!pattern.flags.includes('y')) {
                throw new Error('All regular expressions must be sticky!');
              }

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
              throw new Error('edible.type must be production or terminal');
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

          prevTokensByToken.set(token, s.result);

          s.result = token;
          s.match.token = token;

          returnValue = token;
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
      } else if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!s.co.done) {
        if (s.status === rejected) {
          break;
        } else {
          s.co.advance(returnValue);
        }
      }
    }

    let result = null;

    if (s.status !== rejected) {
      const { token } = s.match;

      if (!token) throw new Error('No result: token did not end');

      const resumingCoroutine = s.coroutines.prev.value;
      const suspendingCommand = resumingCoroutine.value;

      if (suspendingCommand.type === eat) {
        s.coroutines = s.coroutines.pop();
        s.match = null;
      } else {
        s = s.accept();
      }

      if (s.parent.mode === sym.token) {
        s.mode = sym.token;
      }

      // what about metaproductions?
      result = [token, token];
    } else {
      const finishedCo = s.co;
      s = s.parent;
      while (s.co === finishedCo) {
        s = s.reject();
      }
    }

    s.co.advance(result);
  }
}
