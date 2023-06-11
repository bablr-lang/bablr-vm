import { isType } from '../utils/object.js';
import { createToken } from '../utils/token.js';
import { facades } from '../utils/facades.js';
import { validateInstruction } from '../utils/instruction.js';
import * as sym from '../symbols.js';
import { match, rejected, startToken, endToken, startNode, endNode } from '../symbols.js';

export function* __match(context, state, production) {
  const { ctx } = context;
  const s = state;
  const grammar = ctx.grammars.get(sym.token);

  const co = production.value({
    context: facades.get(ctx),
    state: facades.get(s),
    value: facades.get(production.value),
  });

  while (!co.done) {
    const instr = validateInstruction(co.value);

    let returnValue = undefined;

    switch (instr.type) {
      case match: {
        const matchInstruction = instr.value;
        const { matchable } = matchInstruction;

        if (matchable.type === sym.token) {
          const { type, alterLexicalContext: newLexicalContext } = matchable.value;

          const isToken = grammar.is('Token', type);

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

          returnValue = yield instr;
        } else {
          returnValue = yield instr;
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

      case startNode: {
        throw new Error();
      }

      case endNode: {
        throw new Error();
      }

      default:
        returnValue = yield instr;
        break;
    }

    if (s.status !== rejected) {
      co.advance(returnValue);
    }
  }
}
