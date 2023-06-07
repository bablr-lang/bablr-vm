import escapeRegex from 'escape-string-regexp';
import { parse as parseRegex, exec } from '@iter-tools/regex';

import { formatType } from './utils/format.js';
import { freezeSeal, isString, isType } from './utils/object.js';
import { createToken, assertValidRegex } from './utils/token.js';
import { Match } from './match.js';
import * as sym from './symbols.js';
import {
  _none,
  defer,
  match,
  fail,
  active,
  suspended,
  rejected,
  startToken,
  endToken,
} from './symbols.js';

export const matchFrom = (context, state, matchable) => {
  const { value } = matchable.value;

  return Match.from(context, state, matchable, { value });
};

export const maybeUpdateLexicalContext = (s, matchable) => {
  const { type, alterLexicalContext: newLexicalContext } = matchable.value;

  const isToken = s.context.grammars.get(sym.token).is('Token', type);

  if (newLexicalContext) {
    if (!isToken) {
      throw new Error('Nonterminal productions cannot alter lexical context');
    }
    if (newLexicalContext !== sym.parent) {
      if (newLexicalContext === s.lexicalContext) {
        throw new Error('newLexicalContext must be different than state.lexicalContext');
      }

      s.pushLexicalContext(newLexicalContext);
    } else {
      s.popLexicalContext();
    }
  }
};

export function __tokenize(rootMatch) {
  const { ctx } = rootMatch;
  let debug_ = false;
  let m = rootMatch;
  let { s } = m;

  for (;;) {
    while (s.status === active && !m.co.done) {
      // The production generator has just yielded an instruction
      const { value: instr } = m.co;
      const { error: cause } = instr;

      freezeSeal(instr);
      freezeSeal(instr.value);

      if (!isType(instr.type)) throw new Error(`instruction.type must be a type`);

      let returnValue = _none;

      if (debug_) {
        debug_ = false;
        debugger;
      }

      switch (instr.type) {
        case match: {
          const matchInstruction = instr.value;
          const { matchable, effects } = matchInstruction;

          freezeSeal(matchable);
          freezeSeal(effects);

          switch (matchable.type) {
            case sym.token: {
              const { type, value } = matchable.value;

              if (!isType(type)) throw new Error(`matchable.type must be a type`);

              const props = { value };

              m = m.exec(matchInstruction, props);
              ({ s } = m);

              maybeUpdateLexicalContext(s, matchable);

              returnValue = defer;
              break;
            }

            case sym.character: {
              let pattern = matchable.value;

              if (isString(pattern)) {
                pattern = new RegExp(escapeRegex(pattern), 'y');
              }

              assertValidRegex(pattern);

              const [result] = exec(parseRegex(pattern), s.source);

              if (result) {
                if (effects.success === sym.eat) {
                  s.match.value += result;
                  s.source.advance(result.length);
                }
              } else {
                if (effects.failure === sym.fail) {
                  s.match = null;
                  m.terminate();
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

          if (!isType(type)) throw new Error();

          s.match = { type, value: '' };

          returnValue = undefined;
          break;
        }

        case endToken: {
          if (instr.value !== undefined) throw new Error();

          if (!s.match) throw new Error('No token is started');

          const { type, value } = s.match;

          if (!value) throw new Error('Invalid token');

          if (/\r|\n/.test(value) && !/^\r|\r\n|\n$/.test(value)) {
            throw new Error('Invalid LineBreak token');
          }

          const token = createToken(type, value);

          ctx.prevTokens.set(token, s.lastToken);
          s.lastToken = token;
          s.match = null;

          returnValue = token;
          break;
        }

        case fail: {
          s.reject();

          m.co.return();

          returnValue = _none;
          break;
        }

        case 'debug': {
          debug_ = true;

          returnValue = undefined;
          break;
        }

        default:
          throw new Error(
            `Unexpected instruction of {type: ${formatType(instr.type)}}`,
            cause && { cause },
          );
      }

      if (s.status === rejected) {
        break;
      }

      if (returnValue === _none) {
        throw new Error('cst-tokens: unanticipated case: returnValue is none');
      } else if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!m.co.done) {
        m.co.advance(returnValue);
      }
    }

    // resume suspended execution

    {
      const range = m.capture();

      m = m.terminate();

      if (m) {
        ({ s } = m);

        s.status = active;
        m.co.advance(range);
      } else {
        s.status = suspended;
        s.match = null;
        return;
      }
    }
  }
}
