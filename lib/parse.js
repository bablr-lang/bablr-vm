import { effectsFor, shouldBranch } from './utils/instruction.js';
import { getCooked, buildNodeOpenTag, buildNodeCloseTag } from './utils/token.js';
import { Match } from './match.js';
import { Context } from './context.js';
import { Source } from './source.js';
import { runSync } from './run.js';
import { evaluate } from './state.js';
import * as sym from './symbols.js';
import { buildCall, buildExpression } from './transforms.generated.js';

const defer = Symbol('defer');

export function parse(language, sourceText, matcher) {
  const ctx = Context.from(language);
  const source = Source.from(ctx, sourceText);

  return runSync(evaluate(ctx, source, matcher, parseTrampoline));
}

export function* parseTrampoline(ctx, rootState, rootMatcher, rootProps) {
  let m = Match.from(ctx, rootState, rootMatcher, rootProps);
  let matchReturnValue = undefined;

  {
    const type = getCooked(rootMatcher.properties.type);
    if (m.grammar.covers.get(sym.node).has(type) && !m.grammar.covers.has(type)) {
      yield buildCall(
        'emit',
        buildNodeOpenTag(
          type,
          rootMatcher.path && getCooked(rootMatcher.path),
          // buildExpression(attributes),
        ),
      );
    }
  }

  while (m) {
    m.co.advance(matchReturnValue);

    matchReturnValue = undefined;

    while (!m.co.done) {
      const instr = m.co.value;

      let returnValue = undefined;

      const {
        verb: verbToken,
        arguments: {
          properties: { values: { 0: matcher, 1: props } = [] },
        },
      } = instr.properties;
      const verb = getCooked(verbToken);

      switch (verb) {
        case 'eat':
        case 'eatMatch':
        case 'match':
        case 'guard': {
          const effects = effectsFor(verb);

          if (matcher.type === 'NodeMatcher' || matcher.type === 'TerminalMatcher') {
            const isTerminal = matcher.type === 'TerminalMatcher';
            const type = getCooked(matcher.properties.type);

            let { state } = m;

            if (shouldBranch(effects)) {
              state = yield buildCall('branch');
            } else {
              if (m.grammar.covers.get(sym.node).has(type) && !m.grammar.covers.has(type)) {
                const { attrs: attributes } = m.co.value || {};
                yield buildCall(
                  'emit',
                  buildNodeOpenTag(
                    type,
                    matcher.path && getCooked(matcher.path),
                    buildExpression(attributes),
                  ),
                );
              }
            }

            state.terminals = isTerminal ? [] : null;

            m = m.exec(state, effects, matcher, buildExpression(props));

            m.co.advance();

            returnValue = defer;
          } else {
            returnValue = yield instr;

            let { state } = m;

            if (!returnValue && effects.failure === sym.fail) {
              m.collect();
              state = yield buildCall('reject');
            }

            if (returnValue && effects.success === sym.eat) {
              yield buildCall('emit', returnValue);
            }
          }

          break;
        }

        default: {
          returnValue = yield instr;
          break;
        }
      }

      if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!m.co.done) {
        m.co.advance(returnValue);
      }
    }

    {
      // resume suspended execution
      const isTerminal = m.matcher.type === 'TerminalMatcher';
      const type = getCooked(m.matcher.properties.type);

      const range = m.capture();

      if (m.grammar.covers.get(sym.node).has(type) && !m.grammar.covers.has(type)) {
        if (range) {
          yield buildCall('emit', buildNodeCloseTag());
        }
      }

      m = m.collect();

      if (m) {
        matchReturnValue = range;
      } else {
        return range;
      }
    }
  }
}
