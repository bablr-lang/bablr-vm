import * as t from '@bablr/boot-helpers/types';
import { validateInstruction, shouldBranch, effectsFor } from './utils/instruction.js';
import { isSubtypeOf, getCovers } from './utils/grammar.js';
import { getCooked } from './utils/token.js';
import { Context } from './context.js';
import { Source } from './source.js';
import { runSync } from './run.js';
import { dispatcher } from './dispatcher.js';
import { transformTokenMatcher, buildCall, buildString } from './transforms.generated.js';
import * as sym from './symbols.js';
import { rejected } from './symbols.js';

const defer = Symbol('defer');

export function parse(language, sourceText, matchable) {
  const ctx = Context.from(language);
  const source = Source.from(ctx, sourceText);

  return runSync(dispatcher(ctx, source, matchable, parseTrampoline));
}

export function* parseTrampoline(ctx, rootMatch) {
  const { grammar } = ctx;

  let m = rootMatch;

  while (m) {
    let { s } = m;
    m.co.advance();

    while (!m.co.done) {
      const instr = validateInstruction(m.co.value);

      let returnValue = undefined;

      switch (instr.type) {
        case 'Call': {
          const {
            verb: verbToken,
            arguments: {
              properties: { values: { 0: matchable } = [] },
            },
          } = instr.properties;
          const verb = getCooked(verbToken);

          switch (verb) {
            case 'eat':
            case 'eatMatch':
            case 'match':
            case 'guard': {
              if (matchable.type === 'NodeMatcher' || matchable.type === 'TokenMatcher') {
                let { attributes } = matchable;
                const type = getCooked(matchable.properties.type);
                const segment = attributes.path || null;
                const effects = effectsFor(getCooked(instr.properties.verb));

                if (isSubtypeOf(grammar, sym.node, type)) {
                  if (s.path.depth && !segment) throw new Error('segment is missing');

                  if (!getCovers(grammar).has(type)) {
                    const tag = t.node('NodeOpenTag', children, properties, attributes);

                    s.path = s.path.pushTag(tag);

                    if (!shouldBranch(effects)) {
                      // currently the instruction language has no knowledge of CSTML, only spamex
                      // CSTML and spamex are ambiguous with each other
                      yield buildCall('emit', tag);
                    }
                  }
                }

                m = yield buildCall(
                  'dispatch',
                  buildString({ type: 'Literal', value: verb }),
                  ...(matchable.type === 'TokenMatcher'
                    ? transformTokenMatcher(matchable)
                    : [matchable]),
                );

                ({ s } = m);

                m.co.advance();

                returnValue = defer;
              } else {
                returnValue = yield instr;
              }

              break;
            }

            default: {
              returnValue = yield instr;
              break;
            }
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

    if (!m.empty && isSubtypeOf(m.grammar, sym.node, m.type)) {
      yield emit(nodeCloseTag(m.matchable.value.type));
    }

    if (isTerminal && s.match) {
      if (/\r|\n/.test(s.match) && !/^\r|\r\n|\n$/.test(s.match)) {
        throw new Error('Invalid LineBreak token');
      }
    }

    s.match = null;

    m = yield buildCall('terminate');
  }
}
