const { RefResolver } = require('./utils/refs.js');
const { get, set } = require('./utils/object.js');
const { CoroutinePeekerator } = require('./utils/coroutine.js');

const buildGrammar = (node, context) => {
  const { matchNodes, visitors } = context;
  return CoroutinePeekerator.from(visitors[node.type](node, { matchNodes }));
};

// Executes token matching. Serves as a coroutine to grammar generators.
// Takes tokens from `source` and puts them in `matchNode.tokens`
// `node` an AST node that acts as the "pattern" to match
// `grammar` defines which tokens can belong to a given `node`
// `source` could be either flat text or a tokens tree
const __exec = (node, source, context) => {
  const { matchNodes } = context;
  const tokens = [];

  const matchNode = {
    type: node.type,
    node,
    tokens,
    source: {
      // This is as much of the source as I dare make public to the grammar
      type: source.type,
      start: undefined,
      end: undefined,
    },
  };
  const grammar = buildGrammar(node, context);
  let resolver = new RefResolver(node);

  matchNode.source.start = source.index;

  while (!grammar.done) {
    // The grammar generator has just yielded a command
    const command = grammar.value;
    const { type, value } = command;

    if (type === 'emit') {
      tokens.push(...value);
    } else {
      const descriptors = value;
      const forkedResolver = resolver.fork();
      const refChildren = [];
      let { separatorMatch, separatorDescriptor } = context;
      let match_ = [];

      for (const descriptor of descriptors) {
        // Capture any trailing separator tokens that have bubbled up
        if (separatorMatch != null) {
          match_.push(...separatorMatch);
          context.separatorMatch = separatorMatch = null;
          context.separatorDescriptor = separatorDescriptor = null;
        }

        if (descriptor.type === 'Reference') {
          const tokens = source.match(descriptor);
          const refToken = tokens[0];
          const path = forkedResolver.resolve(refToken);
          const child = get(node, path);
          const childSource = source.fork(child);

          // Ensure that any separator tokens at the beginning of the child end up in the parent

          if (separatorDescriptor) {
            // I am assuming that matching this descriptor twice in a row is safe
            const submatch = childSource.match(separatorDescriptor);
            if (submatch) {
              childSource.advance(submatch);
              match_.push(...submatch);
            }
          }

          // Recurse!
          const tree = __exec(child, childSource, context);
          // Done recursing. Yay!

          ({ separatorMatch, separatorDescriptor } = context);

          // Any separator tokens at the end of `child` are now in `context.separatorMatch`
          // They will bubble up and be emitted by the next parent which isn't finished

          match_.push(refToken);
          refChildren.push([path, tree]);
          matchNodes.set(refToken, tree);
          source.advance(tokens, matchNodes);
        } else {
          const submatch = source.match(descriptor);
          if (submatch) {
            if (descriptor.type === 'Separator') {
              // Wait to emit these tokens until we know if they are between nodes
              context.separatorMatch = separatorMatch = submatch;
              context.separatorDescriptor = separatorDescriptor = descriptor;
            } else {
              match_.push(...submatch);
            }
            source.advance(submatch, matchNodes);
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
      } else if (type === 'take') {
        if (match_) {
          tokens.push(...match_);
        } else {
          // Text sources cannot fallback, so this may throw
          const fallbackSource = source.fallback();
          return __exec(node, fallbackSource, context);
        }
      } else {
        throw new Error(`Unknown {type: ${type}}`);
      }
    }

    // Continue executing the grammar generator
    grammar.advance();
  }

  matchNode.source.end = source.index;

  return matchNode;
};

const exec = (node, source, context = buildContext()) => {
  const result = __exec(node, source, context);

  if (context.separatorMatch) {
    result.tokens.push(...context.separatorMatch);
    context.separatorMatch = null;
  }

  return result;
};

const buildContext = (visitors) => ({
  visitors,
  matchNodes: new WeakMap(),
  separatorMatch: null,
  separatorDescriptor: null,
});

module.exports = { exec, buildContext };
