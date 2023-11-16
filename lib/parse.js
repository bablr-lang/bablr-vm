import { effectsFor, shouldBranch } from './utils/instruction.js';
import { getCooked, buildNodeOpenTag, buildNodeCloseTag } from './utils/token.js';
import { Match } from './match.js';
import { Context } from './context.js';
import { Source } from './source.js';
import { runSync } from './run.js';
import { evaluate } from './state.js';
import * as sym from './symbols.js';
import { buildCall, buildExpression } from './transforms.generated.js';
import { freezeSeal } from './utils/object.js';

const defer = Symbol('defer');

export function parse(language, sourceText, matcher) {
  const ctx = Context.from(language);
  const source = Source.from(ctx, sourceText);

  return runSync(evaluate(ctx, source, matcher, parseTrampoline));
}

export function* parseTrampoline(ctx, rootState, rootMatcher, rootProps) {
  let m = Match.from(ctx, rootState, rootMatcher, rootProps);

  while (m) {
    m.co.advance();

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

            let { state } = m;

            if (shouldBranch(effects)) {
              state = yield buildCall('branchState');
            } else {
              const { matcher } = m;
              const { attrs: attributes } = m.co.value || {};
              yield buildCall(
                'emit',
                buildNodeOpenTag(
                  getCooked(matcher.properties.type),
                  matcher.path && getCooked(matcher.path),
                  buildExpression(attributes),
                ),
              );
              m.state.terminals;
            }

            state.terminals = isTerminal ? [] : null;

            m = m.exec(state, effects, matcher, buildExpression(props));

            m.co.advance();

            returnValue = defer;
          } else {
            returnValue = yield instr;

            let { state } = m;

            if (!returnValue && effects.failure === sym.fail) {
              m.terminate();
              state = yield buildCall('rejectState');
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

      const range = m.capture();

      if (range) {
        yield buildCall('emit', buildNodeCloseTag());
      }

      m = m.collect();

      if (m) {
        m.co.advance(range);
        break;
      } else {
        return range;
      }
    }
  }
}
