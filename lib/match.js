const { RefResolver } = require('./utils/refs.js');
const { get, set } = require('./utils/object.js');
const { CoroutinePeekerator } = require('./utils/coroutine.js');

function match(node, source, context) {
  const { visitors, refs } = context;
  const grammar = CoroutinePeekerator.from(visitors[node.type](node, { refs }));
  const tokens = [];
  const sourceRange = [];
  const matchNode = { type: node.type, node, tokens, sourceRange };
  const matchSource = source.fork();
  let resolver = new RefResolver(node);

  sourceRange[0] = source.index;

  while (!grammar.done) {
    const command = grammar.value;
    const { type, value } = command;

    if (type === 'emit') {
      tokens.push(...value);
    } else {
      const descriptors = value;
      const forkedResolver = resolver.fork();
      const refChildren = [];
      let match_ = [];
      for (const descriptor of descriptors) {
        if (descriptor.type === 'Reference') {
          const refToken = matchSource.match(descriptor);
          const path = forkedResolver.resolve(refToken);
          const node = get(resolver.node, path);
          const tree = match(node, matchSource, context);

          match_.push(refToken);
          refs.set(refToken, tree);
          refChildren.push([path, tree]);
          matchSource.advance([refToken], refs);
        } else {
          const submatch = matchSource.match(descriptor);
          if (submatch) {
            match_.push(...submatch);
            matchSource.advance(submatch, refs);
          } else {
            match_ = null;
          }
        }

        if (!match_) break;
      }

      if (match_) {
        for (const [path, tree] of refChildren) {
          set(matchNode, path, tree);
        }
        resolver = forkedResolver;
      }

      if (type === 'match') {
        // Feeds matching tokens to the grammar generator. In the grammar it looks like:
        // tokens = yield match(...descriptors);
        grammar.advance(match_);
        continue;
      } else if (type === 'take' || type === 'takeMatch') {
        if (match_) {
          tokens.push(...match_);
        } else {
          if (type === 'take') {
            // Text sources cannot fallback, so this may throw
            const fallbackSource = source.fallback();
            return match(node, fallbackSource, context);
          }
        }
      } else {
        throw new Error(`Unknown {type: ${type}}`);
      }
    }

    grammar.advance();
  }

  sourceRange[1] = matchSource.index;

  return matchNode;
}

const buildContext = (visitors) => ({ visitors, refs: new WeakMap() });

module.exports = { match, buildContext };
