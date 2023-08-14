import { validateInstruction, shouldBranch } from './utils/instruction.js';
import { emit, dispatch, terminate } from './utils/dispatcher.js';
import { tokenTag, nodeOpenTag, nodeCloseTag } from './utils/ast.js';
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
  const matchable = { type: 'NodeGapTag', value: { type: gapType, attrs } };

  return runSync(dispatcher(ctx, source, matchable, parseTrampoline));
}

export function* parseTrampoline(ctx, rootMatch) {
  const nodeGrammar = ctx.grammars.get(sym.node);
  const tokenGrammar = ctx.grammars.get(sym.token);

  let m = rootMatch;

  while (m) {
    let { s } = m;
    m.co.advance();

    while (!m.co.done) {
      const instr = validateInstruction(m.co.value);

      let returnValue = undefined;

      switch (instr.type) {
        case sym.match: {
          const { effects, matchable } = instr.value;

          if (matchable.type === 'NodeGapTag') {
            if (m.matchable.grammarType === sym.token) {
              throw new Error('Cannot match a node from inside a token');
            }

            const { type, attrs } = matchable.value;
            const segment = attrs.get('path') || null;

            if (nodeGrammar.is(sym.node, type)) {
              if (s.path.depth && !segment) throw new Error('segment is missing');

              if (!nodeGrammar.aliases.has(type)) {
                const tag = nodeOpenTag(s.path.isGap ? s.path.gapType : type, type, attrs);

                s.path = s.path.pushTag(tag);

                if (!shouldBranch(effects)) {
                  yield emit(tag);
                }
              }
            }

            m = yield dispatch(instr.value);
            ({ s } = m);

            m.co.advance();

            returnValue = defer;
          } else if (matchable.type === 'TokenGapTag') {
            // if (s.path.isGap && effects.success === sym.eat) {
            //   throw new Error('Cannot eat tokens outside of a node');
            // }

            const { type, attrs } = matchable.value;
            const startSpan = attrs.get('startSpan');
            const endSpan = attrs.get('endSpan');
            const isToken = tokenGrammar.is(sym.token, type);

            if (s.match && isToken) {
              throw new Error('A token is already started');
            }

            if ((!isToken && startSpan) || endSpan) {
              throw new Error('Only tokens can start or end spans');
            }

            m = yield dispatch(instr.value);
            ({ s } = m);

            s.match = '';

            m.co.advance();

            returnValue = defer;
          } else if (matchable.type === 'String' || matchable.type === 'Regex') {
            returnValue = yield instr;
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

    switch (m.grammarType) {
      case sym.node:
        if (!m.empty && m.grammar.is(sym.node, m.type)) {
          yield emit(nodeCloseTag(m.matchable.value.type));
        }

        break;

      case sym.token: {
        if (s.match) {
          if (/\r|\n/.test(s.match) && !/^\r|\r\n|\n$/.test(s.match)) {
            throw new Error('Invalid LineBreak token');
          }

          if (m.grammar.is(sym.token, m.matchable.value.type)) {
            yield emit(tokenTag(m.matchable.value.type, s.match));
          } else {
            throw new Error('b-b-b-b-bad');
          }
        }

        s.match = null;

        break;
      }
    }

    m = yield terminate();
  }
}
