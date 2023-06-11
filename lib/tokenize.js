import { formatType } from './utils/format.js';
import { isType } from './utils/object.js';
import { createToken } from './utils/token.js';
import { Match } from './match.js';
import * as sym from './symbols.js';
import {
  _none,
  defer,
  match,
  reject,
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
  let m = rootMatch;
  let { s } = m;

  for (;;) {
    while (s.status === active && !m.co.done) {
      // The production generator has just yielded an instruction
      const { value: instr } = m.co;
      const { error: cause } = instr;

      let returnValue = _none;

      switch (instr.type) {
        case match: {
          const matchInstruction = instr.value;
          const { matchable } = matchInstruction;

          switch (matchable.type) {
            case sym.token: {
              const { value } = matchable.value;

              const props = { value };

              m = m.exec(matchInstruction, props);
              ({ s } = m);

              maybeUpdateLexicalContext(s, matchable);

              returnValue = defer;
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

        case reject: {
          s.reject();

          m.co.return();

          returnValue = _none;
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
