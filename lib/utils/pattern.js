import { generateMatches } from '@bablr/regex-vm';
import { getStreamIterator, StreamIterable } from '@bablr/agast-helpers/stream';
import * as Tags from '@bablr/agast-helpers/tags';
import { Node } from '@bablr/agast-helpers/symbols';
import {
  buildCloseNodeTag,
  buildLiteralTag,
  buildOpenNodeTag,
  tokenFlags,
} from '@bablr/agast-helpers/builders';
import { continue_, streamIteratorSymbol, wait } from '@bablr/stream-iterator';
import { sourceFromTags } from '@bablr/helpers/source';
import { isEmpty, maybeWait } from '@bablr/agast-helpers/iterable';
import { isString } from '@bablr/agast-helpers/object';
import { RegexMatcher, StringMatcher } from '@bablr/agast-vm-helpers/symbols';

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
  let step;
  try {
    step = iter.next();

    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = iter.next());
      if (step instanceof Promise) step = yield wait(step);
    }

    while (!step.done) {
      yield step.value;
      step = iter.next();

      while (step === null || step instanceof Promise) {
        if (step === null) yield continue_(), (step = iter.next());
        if (step instanceof Promise) step = yield wait(step);
      }
    }

    yield Symbol.for('EOS');
  } finally {
    step = iter.return();

    if (step instanceof Promise) {
      step = yield wait(step);
    }
  }
}

export const wrapSource = (source) => {
  return new StreamIterable(__wrapSource(source));
};

let promiseCo = (gen) => {
  return (...args) => {
    let generator = gen(...args);

    let fn = (step) => {
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
  let step;

  try {
    let strStep = strIter.next();
    step = iter.next();

    while (true) {
      while (step === null || step instanceof Promise) {
        if (step === null) yield continue_(), (step = iter.next());
        if (step instanceof Promise) step = yield wait(step);
      }

      if (strStep.done) break;

      if (step.value !== strStep.value) {
        step = iter.return();
        if (step instanceof Promise) {
          step = yield wait(step);
        }
        return false;
      }

      strStep = strIter.next();
      step = iter.next();
    }
  } finally {
    step = iter.return();
    if (step instanceof Promise) {
      step = yield wait(step);
    }
  }
  return true;
}

let stringEqual = (str, iterable) => {
  return promiseCo(__stringEqual)(str, iterable);
};

export const match = (pattern, source) => {
  let strPattern = isString(pattern)
    ? pattern
    : pattern.type === StringMatcher
    ? pattern.value
    : null;

  if (strPattern && strPattern.length === 1) {
    return strPattern === source.value
      ? [buildOpenNodeTag(tokenFlags), buildLiteralTag(strPattern), buildCloseNodeTag()]
      : null;
  } else if (strPattern || pattern.type === Node) {
    let pattern_ = strPattern || sourceFromTags(Tags.traverse(Tags.getTags(pattern)));
    return maybeWait(stringEqual(pattern_, source), (equal) => {
      return equal
        ? strPattern
          ? [
              buildOpenNodeTag(tokenFlags),
              buildLiteralTag(isString(pattern) ? pattern : pattern.value),
              buildCloseNodeTag(),
            ]
          : Tags.traverse(Tags.getTags(pattern))
        : null;
    });
  }

  if (pattern.type !== RegexMatcher) throw new Error();

  let iter = getStreamIterator(generateMatches(pattern, wrapSource(source)));

  let step = iter.next();

  return maybeWait(step, (step) => {
    if (!step.done && step.value.length > 1) throw new Error('capturing group');
    let result = step.done ? null : step.value[0];
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
    let { pattern, source } = this;

    let guardMatch = match(pattern, source);

    return maybeWait(guardMatch, (guardMatch) => {
      if (guardMatch || source.done) {
        this.done = true;
        source.release();
        return { value: undefined, done: true };
      } else {
        let { value } = source;
        return maybeWait(source.advance(), (_) => ({ value, done: false }));
      }
    });
  }

  return() {
    this.source.release();
  }

  release() {
    this.source.release();
  }

  [streamIteratorSymbol]() {
    return this;
  }
}

export const guardWithPattern = (pattern, source) => {
  return new GuardedIterator(pattern, source);
};
