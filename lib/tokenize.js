import regexEscape from 'escape-string-regexp';
import { parse as parseRegex, exec } from '@iter-tools/regex';

import { formatType } from './utils/format.js';
import { facades } from './utils/facades.js';
import { isRegex, isString } from './utils/object.js';
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
  active,
  suspended,
  rejected,
  startToken,
  endToken,
} from './symbols.js';

function* anyProduction({ productions }) {
  for (const production of productions) {
    yield {
      type: sym.eatMatch,
      value: { type: sym.token, value: { type: production } },
      error: undefined,
    };
  }
}

export function tokenize(context, initialState, type, value) {
  const ctx = context;
  const { tokenGrammar: grammar } = ctx;
  let debug_ = false;
  let s = initialState;
  const getState = () => facades.get(s);

  if (!grammar.aliases.has('Token')) {
    throw new Error('A Token alias is required');
  }

  s.status = active;

  s.coroutines = s.coroutines.push(
    Coroutine.from(grammar, type, { getState, lexicalContext: s.lexicalContext, value }),
  );

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
          const matchable = instr.value;

          if (instr.type !== eat) {
            s = s.branch(); // nested state
          }

          switch (matchable.type) {
            case sym.token: {
              const { type, value, props } = matchable.value;
              const isMeta = grammar.is('Token', type);
              const aliasProductions = grammar.aliases.get(type);

              if (aliasProductions) {
                if (!isString(s.source.value) && !grammar.is(type, s.source.value.type)) {
                  // no match
                  returnValue = null;
                  break;
                } else {
                  s.coroutines = s.coroutines.push(
                    new Coroutine(anyProduction({ productions: aliasProductions })),
                  );
                }
              } else {
                // don't create empty matchState if isMeta is true

                s.coroutines = s.coroutines.push(
                  Coroutine.from(grammar, type, {
                    ...props,
                    value,
                    getState,
                  }),
                );
              }

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

              if (!isRegex(pattern)) {
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

          returnValue = s.match.token = createToken(type, value);
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

      if (s.status === rejected) {
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

    const resumingCoroutine = s.coroutines.prev?.value;

    if (resumingCoroutine) {
      const suspendingCommand = resumingCoroutine.value;

      if (s.status !== rejected) {
        const { token } = s.match;

        if (!token) throw new Error('No result: token did not end');

        if (suspendingCommand.type === eat) {
          s.coroutines = s.coroutines.pop();
          s.match = null;
        } else {
          s = s.accept();
        }
      } else {
        const finishedCo = s.co;
        s = s.parent;
        while (s.co === finishedCo) {
          s = s.reject();
        }
      }
    } else {
      if (s.status !== rejected) {
        if (!s.match) throw new Error('No result: token did not start or end');
        if (!s.match.token) throw new Error('No result: token did not end');
      }
    }

    if (s.status === suspended) throw new Error();

    s.status = suspended;

    return s;
  }
}
