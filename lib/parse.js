import escapeRegex from 'escape-string-regexp';
import { parse as parseRegex, exec } from '@iter-tools/regex';
import { validateInstruction, shouldBranch } from './utils/instruction.js';
import { assertValidRegex } from './utils/token.js';
import { isString } from './utils/object.js';
import { emit, dispatch, init, accept } from './utils/dispatcher.js';
import { Context } from './context.js';
import { Source } from './source.js';
import { runSync } from './run.js';
import { dispatcher } from './dispatcher.js';
import * as sym from './symbols.js';
import { rejected } from './symbols.js';

const defer = Symbol('defer');

export function parse(language, sourceText, gapType, attrs = new Map()) {
  const ctx = Context.from(language);
  const source = Source.from(ctx, sourceText);
  const matchable = { type: 'GapTag', value: { type: gapType, attrs } };

  return runSync(dispatcher(ctx, source, matchable, __parse(ctx)));
}

export function* __parse(ctx) {
  const nodeGrammar = ctx.grammars.get(sym.node);
  const tokenGrammar = ctx.grammars.get(sym.token);

  let m = yield init();
  let { s } = m;

  m.co.advance();

  while (m) {
    while (!m.co.done) {
      const instr = validateInstruction(m.co.value);

      let returnValue = undefined;

      switch (instr.type) {
        case sym.match: {
          const { effects, matchable } = instr.value;

          if (matchable.type === 'GapTag') {
            const { type, attrs } = matchable.value;
            const segment = attrs.get('path');

            if (nodeGrammar.is('Node', type)) {
              s = shouldBranch(effects) ? s.branch() : s;

              if (s.path.depth && !segment) throw new Error('segment is missing');

              if (!nodeGrammar.aliases.has(type)) {
                const openTag = {
                  type: 'OpenTag',
                  value: {
                    gapType: s.path.isGap ? s.gapType : type,
                    type,
                    attrs,
                  },
                };

                s.path = s.path.pushTag(openTag);

                if (!shouldBranch(effects)) {
                  yield emit(openTag);
                }
              }
            } else {
              s = shouldBranch(effects) ? s.branch() : s;
            }

            m = yield dispatch(instr.value);
            ({ s } = m);

            m.co.advance();

            returnValue = defer;
          } else if (matchable.type === 'TokenTag') {
            // if (s.path.isGap && effects.success === sym.eat) {
            //   throw new Error('Cannot eat tokens outside of a node');
            // }

            const { type, attrs } = matchable.value;
            const startSpan = attrs.get('startSpan');
            const endSpan = attrs.get('endSpan');
            const isToken = tokenGrammar.is('Token', type);

            if (s.match && isToken) {
              throw new Error('A token is already started');
            }

            if ((!isToken && startSpan) || endSpan) {
              throw new Error('Only tokens can start or end spans');
            }

            m = yield dispatch(instr.value);
            ({ s } = m);

            s.match = { type, value: '' };

            m.co.advance();

            returnValue = defer;
          } else if (matchable.type === 'StringPattern' || matchable.type === 'RegexPattern') {
            const cs = m.grammarType === sym.node ? s.chrState : s;
            if (!cs.match && effects.success === sym.eat) {
              throw new Error('Grammar must not eat characters outside a token');
            }

            let pattern = matchable.value;

            if (isString(pattern)) {
              pattern = new RegExp(escapeRegex(pattern), 'y');
            }

            assertValidRegex(pattern);

            const [result] = exec(parseRegex(pattern), cs.source);

            if (result) {
              if (effects.success === sym.eat) {
                cs.match.value += result;
                cs.source.advance(result.length);
              }
            } else {
              if (effects.failure === sym.reject) {
                cs.match = null;
                m.terminate();
              }
            }
            returnValue = result;
          } else {
            throw new Error(`Unkown matchable of {type: ${matchable.type}}`);
          }
          break;
        }

        default: {
          returnValue = yield instr;
          break;
        }
      }

      if (s.status === rejected) {
        break;
      }

      if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!m.co.done) {
        m.co.advance(returnValue);
      }
    }

    // resume suspended execution

    m = yield accept();
  }
}
