import emptyStack from '@iter-tools/imm-stack';
import { parsePath } from '@bablr/boot-helpers/path';
import { effectsFor, shouldBranch, reifyExpression, parseAttributes } from './utils/instruction.js';
import { getCooked, buildNodeOpenTag, buildNodeCloseTag } from './utils/token.js';
import { freezeSeal, hasOwn } from './utils/object.js';
import { Match } from './match.js';
import { Context } from './context.js';
import { Source } from './source.js';
import { runSync } from './run.js';
import { evaluate } from './state.js';
import * as sym from './symbols.js';
import { buildCall } from './transforms.generated.js';

const defer = Symbol('defer');

export function streamParse(language, sourceText, matcher) {
  const ctx = Context.from(language);
  const source = Source.from(ctx, sourceText);

  return runSync(evaluate(ctx, source, matcher, parseTrampoline));
}

export function parse(language, sourceText, matcher) {
  const terminals = streamParse(language, sourceText, matcher);

  let nodes = emptyStack;
  let node;

  for (const terminal of terminals) {
    switch (terminal.type) {
      case 'OpenNode': {
        const {
          path,
          tag: { language, type, attributes },
        } = terminal.value;

        const newNode = freezeSeal({ language, type, children: [], properties: {}, attributes });

        if (node) {
          node.children.push({ type: 'Reference', value: path });

          // .[path]
          const { pathName, pathIsArray } = parsePath(path);

          if (pathIsArray) {
            if (!hasOwn(node.properties(pathName))) {
              node.properties[pathName] = [];
            }
            const array = node.properties[pathName];

            array.push(newNode);
          } else {
            node.properties[pathName] = newNode;
          }
        }

        nodes = nodes.push(newNode);
        node = nodes.value;

        break;
      }

      case 'CloseNode': {
        const completedNode = node;

        freezeSeal(completedNode.properties);
        freezeSeal(completedNode.children);

        nodes = nodes.pop();
        node = nodes.value;
        break;
      }

      default: {
        node.children.push(terminal);
        break;
      }
    }
  }
}

export function* parseTrampoline(ctx, rootState, rootMatcher, rootProps) {
  let m = Match.from(ctx, rootState, rootMatcher, null, rootProps);
  let matchReturnValue = undefined;

  {
    const type = getCooked(rootMatcher.properties.type);
    if (m.grammar.covers.get(sym.node).has(type) && !m.grammar.covers.has(type)) {
      yield buildCall(
        'emit',
        buildNodeOpenTag(
          type,
          null,
          rootMatcher.properties.attributes && reifyExpression(rootMatcher.properties.attributes),
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

      const { verb: verbToken, arguments: args } = instr.properties;
      const verb = getCooked(verbToken);

      switch (verb) {
        case 'eat':
        case 'eatMatch':
        case 'match':
        case 'guard': {
          const {
            properties: { values: { 0: matcher, 1: path, 2: props } = [] },
          } = args;

          const effects = effectsFor(verb);

          if (matcher.type === 'NodeMatcher' || matcher.type === 'TerminalMatcher') {
            const type = getCooked(matcher.properties.type);
            const isTerminal = matcher.type === 'TerminalMatcher';
            const isNode = m.grammar.covers.get(sym.node).has(type);
            const isCover = m.grammar.covers.has(type);

            let { state } = m;

            if (shouldBranch(effects)) {
              state = yield buildCall('branch');
            }

            const strPath =
              !path || path.type === 'Null' ? m.path || null : getCooked(path.properties.content);

            m = m.exec(state, effects, matcher, strPath, props);

            state.terminals = isTerminal ? [] : null;

            // for covers we need to save path and use it on children later
            //    create a path before we have a node
            if (isNode && !isCover) {
              yield buildCall(
                'emit',
                buildNodeOpenTag(
                  type,
                  strPath,
                  matcher.properties.attributes && parseAttributes(matcher.properties.attributes),
                ),
              );
            } else {
              // m.path = ?
            }

            m.co.advance();

            returnValue = defer;
          } else {
            returnValue = yield instr;

            if (!returnValue && effects.failure === sym.fail) {
              m.collect();
              yield buildCall('reject');
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

      if (m.grammar.covers.get(sym.node).has(type) && !m.grammar.covers.has(type)) {
        if (isTerminal ? m.s.terminals.length >= 1 : m.precedingTerminal !== m.state.result) {
          yield buildCall('emit', buildNodeCloseTag(type));
        }
      }

      const range = m.capture();

      const completedMatch = m;

      m = m.collect();

      if (m) {
        const { effects } = completedMatch;

        if ((range && effects.success === sym.fail) || (!range && effects.failure === sym.none)) {
          yield buildCall('reject');
        } else if (shouldBranch(effects)) {
          yield buildCall('accept');
        }

        matchReturnValue = range;
      } else {
        return range;
      }
    }
  }
}
