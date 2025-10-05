import isString from 'iter-tools-es/methods/is-string';
import isEmpty from 'iter-tools-es/methods/is-empty';
import { generateMatches } from '@bablr/regex-vm';
import {
  getStreamIterator,
  maybeWait,
  printType,
  StreamIterable,
} from '@bablr/agast-helpers/stream';
import * as Tags from '@bablr/agast-helpers/tags';
import {
  buildAlternative,
  buildAlternatives,
  buildElements,
  buildPattern,
  buildRegexGap,
  buildToken,
} from '@bablr/helpers/builders';
import { buildEmbeddedRegex } from '@bablr/agast-vm-helpers/builders';
import { GapTag, LiteralTag } from '@bablr/agast-helpers/symbols';
import {
  buildCloseNodeTag,
  buildLiteralTag,
  buildOpenNodeTag,
  tokenFlags,
} from '@bablr/agast-helpers/builders';
import { streamIteratorSymbol } from '@bablr/stream-iterator';

function* __wrapSource(source) {
  let source_ = source.source || source;
  if ('\r\n'.includes(source_.prevValue)) {
    yield '\n';
  } else if (source_.index === 0) {
    yield Symbol.for('BOS');
  } else {
    yield '';
  }
  let iter = getStreamIterator(source);

  let step = iter.next();

  if (step instanceof Promise) {
    step = yield step;
  }

  while (!step.done) {
    yield step.value;
    step = iter.next();

    if (step instanceof Promise) {
      step = yield step;
    }
  }

  step = iter.return();

  if (step instanceof Promise) {
    step = yield step;
  }

  yield Symbol.for('EOS');
}

export const wrapSource = (source) => {
  return new StreamIterable(__wrapSource(source));
};

export const assertValidRegex = (expr) => {
  if (!expr.language === 'Spamex' && expr.type === 'Regex') {
    throw new Error();
  }

  // TODO validate the rest of it
};

const buildStringRegex = (str) => {
  return buildPattern(
    buildAlternatives([
      buildAlternative(buildElements([...str].map((chr) => buildToken('Character', chr)))),
    ]),
  );
};

const buildFragmentRegex = (frag) => {
  return buildPattern(
    buildAlternatives([
      buildAlternative(
        buildElements(
          [...Tags.traverse(frag.tags)].flatMap((tag) => {
            if (tag.type === LiteralTag) {
              let str = tag.value;
              return [...str].map((chr) => buildToken('Character', chr));
            } else if (tag.type === GapTag) {
              return [buildRegexGap()];
            } else {
              return [];
            }
          }),
        ),
      ),
    ]),
  );
};

const promiseCo = (gen) => {
  return (...args) => {
    let generator = gen(...args);

    const fn = (step) => {
      if (step.done) {
        return step.value;
      } else if (step.value instanceof Promise) {
        return step.value.then((value) => {
          return fn(generator.next(value));
        });
      }
    };

    return fn(generator.next());
  };
};

function* __stringEqual(str, iterable) {
  let strIter = str[Symbol.iterator]();
  let iter = getStreamIterator(iterable);

  let strStep = strIter.next();
  let step = iter.next();

  while (!strStep.done) {
    if (step instanceof Promise) {
      step = yield step;
    }

    if (step.value !== strStep.value) {
      step = iter.return();
      if (step instanceof Promise) {
        step = yield step;
      }
      return false;
    }

    strStep = strIter.next();
    step = iter.next();
  }

  step = iter.return();
  if (step instanceof Promise) {
    step = yield step;
  }
  return true;
}

const stringEqual = (str, iterable) => {
  return promiseCo(__stringEqual)(str, iterable);
};

export const match = (pattern, source) => {
  if (typeof pattern === 'string' && pattern.length === 1) {
    return pattern === source.value
      ? [buildOpenNodeTag(tokenFlags), buildLiteralTag(pattern), buildCloseNodeTag()]
      : null;
  } else if (typeof pattern === 'string') {
    return stringEqual(pattern, source)
      ? [buildOpenNodeTag(tokenFlags), buildLiteralTag(pattern), buildCloseNodeTag()]
      : null;
  }

  const pattern_ =
    pattern.type === null && pattern.flags.token
      ? buildFragmentRegex(pattern)
      : isString(pattern)
      ? buildStringRegex(pattern)
      : pattern;

  if (printType(pattern_.type) !== 'Pattern') throw new Error();

  assertValidRegex(pattern_);

  const iter = getStreamIterator(generateMatches(buildEmbeddedRegex(pattern_), wrapSource(source)));

  const step = iter.next();

  return maybeWait(step, (step) => {
    if (!step.done && step.value.length > 1) throw new Error('capturing group');
    const result = step.done ? null : step.value[0];
    return maybeWait(iter.return(), () => {
      return isEmpty(result) ? null : result;
    });
  });
};

class GuardedIterator {
  constructor(pattern, source) {
    this.pattern = pattern;
    this.source = source.branch();
    this.done = false;
  }

  get value() {
    return this.source.value;
  }

  next() {
    const { pattern, source } = this;

    const guardMatch = match(pattern, source);

    return maybeWait(guardMatch, (guardMatch) => {
      if (guardMatch || source.done) {
        this.done = true;
        source.release();
        return { value: undefined, done: true };
      } else {
        const { value } = source;
        return maybeWait(source.advance(), (_) => ({ value, done: false }));
      }
    });
  }

  return() {
    this.source.release();
  }

  [streamIteratorSymbol]() {
    return this;
  }
}

export const guardWithPattern = (pattern, source) => {
  return new GuardedIterator(pattern, source);
};
