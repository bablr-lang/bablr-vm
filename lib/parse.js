import emptyStack from '@iter-tools/imm-stack';
import { effectsFor, shouldBranch, reifyExpression, parseAttributes } from './utils/instruction.js';
import { getCooked } from './utils/token.js';
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

          const { pathName, pathIsArray } = path;

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
  let m = Match.from(ctx, rootState, rootProps);
  let s = rootState;
  let matchReturnValue = undefined;

  yield buildCall(
    'startNode',
    null,
    null,
    rootMatcher.properties.attributes && reifyExpression(rootMatcher.properties.attributes),
  );

  m = m.exec(rootState, effectsFor('eat'), rootMatcher, 'children[]', rootProps);

  while (m.co) {
    m.co.advance(matchReturnValue);

    matchReturnValue = undefined;

    instrLoop: while (!m.co.done) {
      const instr = m.co.value;

      let returnValue = undefined;

      const { verb: verbToken, verbSuffix: verbSuffixToken, arguments: args } = instr.properties;
      const verb = getCooked(verbToken);
      const verbSuffix = verbSuffixToken && getCooked(verbSuffixToken);

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
            const isNode = m.grammar.covers.get(sym.node).has(type);
            const isTerminalNode = matcher.type === 'TerminalMatcher';
            const isCover = m.grammar.covers.has(type);
            const strPath =
              !path || path.type === 'Null'
                ? m.path || 'children[]'
                : getCooked(path.properties.content);

            const attributes = parseAttributes(matcher.properties.attributes);

            if (verbSuffix) {
              throw new Error('Nodes cannot be trivia or escapes');
            }

            if (isNode && !isCover) {
              yield buildCall('reference', strPath);
            }

            if (shouldBranch(effects)) {
              s = yield buildCall('branch');
            }

            m = m.exec(s, effects, matcher, strPath, props);

            if (isNode && !isCover) {
              yield buildCall('startNode', type, attributes, isTerminalNode);
            }

            m.co.advance();

            returnValue = defer;
          } else {
            returnValue = yield instr;

            if (!returnValue && effects.failure === sym.fail) {
              s = yield buildCall('reject');
              break instrLoop;
            }
          }

          break;
        }

        case 'fail': {
          s = yield buildCall('reject');
          break instrLoop;
        }

        default: {
          throw new Error('Unknown instruction type');
        }
      }

      if (returnValue === defer) {
        // execution is suspeneded until the state stack unwinds
      } else if (!m.co.done) {
        m.co.advance(returnValue);
      }
    } // end instrLoop

    {
      // resume suspended execution
      const type = getCooked(m.matcher.properties.type);
      const failed = m.s !== s;
      const { effects } = m;

      if (
        !failed &&
        m.grammar.covers.get(sym.node).has(type) &&
        !m.grammar.covers.has(type) &&
        m.s.result.type !== 'OpenNode'
      ) {
        yield buildCall('endNode', type);
      }

      const range = failed ? null : m.capture();

      if (!failed && shouldBranch(effects)) {
        if ((range && effects.success === sym.fail) || !range) {
          s = yield buildCall('reject');
        } else {
          s = yield buildCall('accept');
        }
      }

      m = m.collect();

      if (m.co) {
        ({ s } = m);
        matchReturnValue = range;
      } else {
        yield buildCall('endNode', null);
        const range = m.capture();
        if (range) {
          if (!s.source.done) {
            throw new Error('Parser failed to consume entire input');
          }

          return range;
        } else {
          throw new Error('parsing failed');
        }
      }
    }
  }
}
