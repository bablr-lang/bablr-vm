const { peekerate } = require('iter-tools-es');
const { VISITOR_KEYS } = require('@babel/types');

const { getRange } = require('../utils/range.js');
const { isArray } = require('../utils/array.js');
const { MinimalBuilder } = require('./minimal.js');

const EXTRA_KEYS = {
  Literal: [],
};

function getExcludedRanges(node) {
  const excludedRanges = [];
  for (const key of VISITOR_KEYS[node.type] || EXTRA_KEYS[node.type]) {
    const referenced = node[key];
    if (referenced == null) {
      continue;
    } else if (isArray(referenced)) {
      for (const value of referenced) {
        excludedRanges.push(getRange(value));
      }
    } else {
      excludedRanges.push(getRange(referenced));
    }
  }

  return excludedRanges.sort((a, b) => a[0] - b[0]);
}

function buildRanges(range, excludedRanges) {
  const start = range[0];
  const end = range[1];
  const ranges = [];
  let pos = start;

  for (const excludedRange of excludedRanges) {
    const start = excludedRange[0];
    const end = excludedRange[1];
    if (start >= pos) {
      ranges.push([pos, start]);
      pos = end;
    } else if (end > pos) {
      pos = end;
    }
  }

  if (pos < end) {
    ranges.push([pos, end]);
  }
  return ranges;
}

class SourceBuilder extends MinimalBuilder {
  constructor(node, options) {
    super(node, options);
    const range = getRange(node);
    // These ranges belong to other nodes internal to this one
    const excludedRanges = getExcludedRanges(node);
    // These ranges contain the concrete syntax for this node
    const ranges = buildRanges(range, excludedRanges);

    this.ranges = ranges;
    // Working with fragments ensures we never match against text we don't own
    this.rangesPeekr = peekerate(ranges);
    this.start = range[0];
    this.end = range[1];
    this.idx = this.start;
    this.fallback = false;
  }

  *advance(token, optional = false) {
    let { fallback, rangesPeekr, idx, options } = this;
    const { sourceText } = options;

    if (fallback) {
      yield* super.advance(token, optional);
      return;
    } else if (token.type === 'Reference') {
      rangesPeekr.advance();

      if (!rangesPeekr.done) {
        const range = rangesPeekr.value;

        this.idx = idx = range[0];
      }

      yield token.build();
    } else {
      let match = null;
      if (!rangesPeekr.done) {
        const range = rangesPeekr.value;

        if (range) {
          match = token.matchString(sourceText.slice(idx, range[1]));
        }
      }

      if (match != null) {
        this.idx = idx = idx + match.length;

        yield token.build(match);
      } else if (!optional) {
        this.fallback = fallback = true;

        yield super.advance(token, optional);
      }
    }
  }
}

module.exports = { SourceBuilder };
