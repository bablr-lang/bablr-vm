import { maybeWait, getStreamIterator } from '@bablr/agast-helpers/stream';
import { facades, actuals } from './facades.js';
import { streamIteratorSymbol } from '@bablr/stream-iterator';

// Queue item instances are shared between all sources.
class QueueItem {
  constructor(step) {
    this.step = step;
    this.next = null;
  }
}

class Exchange {
  constructor(iterator) {
    if (!iterator) throw new Error();

    this.iterator = iterator;
    this.tail = new QueueItem(null);
    this.head = this.tail;
    this.sources = 0;
  }

  static from(iterable) {
    return new Exchange(getStreamIterator(iterable));
  }

  get isWaiting() {
    return this.head.step instanceof Promise;
  }

  allocateSource(source) {
    const { head = this.tail, exchange = this, index, holding, prevValue } = source || {};
    ++this.sources;
    return new Source(head, exchange, index, holding, prevValue);
  }

  releaseSource(source) {
    --this.sources;
    if (this.sources === 0) {
      this.iterator.return?.();
    }
    source.exchange = null;
    return { value: undefined, done: true };
  }

  advance() {
    this.tail = this.tail.next;
  }

  fetch() {
    let step = this.iterator.next();

    if (step instanceof Promise) {
      step = step.then((step) => {
        newItem.step = step;
      });
    }

    let newItem = new QueueItem(step);

    this.head.next = newItem;
    this.head = this.head.next;

    return newItem;
  }
}

let sources = new WeakMap();

class SourceIterator {
  static from(source) {
    const { exchange } = source;
    return source.done
      ? new SourceIterator(source)
      : new SourceIterator(exchange.allocateSource(source));
  }

  constructor(source) {
    sources.set(this, source);
  }

  next() {
    const source = sources.get(this);
    if (!source.done) {
      const { holding, head } = source;
      source.advance();
      return maybeWait(source.head.step, () => {
        return holding ? { value: null, done: false } : head.step;
      });
    } else {
      return { value: undefined, done: true };
    }
  }

  return() {
    sources.get(this).release();

    return { value: undefined, done: true };
  }

  [Symbol.iterator]() {
    return this;
  }

  [streamIteratorSymbol]() {
    return this;
  }
}

export const SourceFacade = class BABLRSourceFacade {
  static from(iterable) {
    return facades.get(Source.from(iterable));
  }

  constructor(source) {
    facades.set(source, this);

    Object.freeze(this);
  }

  [streamIteratorSymbol]() {
    return actuals.get(this)[streamIteratorSymbol]();
  }

  get done() {
    return actuals.get(this).done;
  }

  get value() {
    return actuals.get(this).value;
  }

  get index() {
    return actuals.get(this).index;
  }

  get atGap() {
    return actuals.get(this).atGap;
  }
};

export const Source = class BABLRSource {
  static from(iterable) {
    const exchange = Exchange.from(iterable);
    return exchange.allocateSource();
  }

  constructor(head, exchange, index = -1, holding = false, prevValue = undefined) {
    if (!head || !exchange) throw new Error();

    this.head = head;
    this.exchange = exchange;
    this.index = index;
    this.holding = holding;
    this.prevValue = prevValue;

    new SourceFacade(this);
  }

  get value() {
    return this.holding ? null : this.head.step?.value;
  }

  get done() {
    return !this.exchange || this.head.step?.done;
  }

  get atGap() {
    return this.holding || (!this.done && this.value == null);
  }

  advance(n = 1) {
    let { exchange } = this;

    if (this.holding) {
      this.holding = false;
      n--;
    }

    return new Array(n).fill(null).reduce((acc) => {
      return maybeWait(acc, () => {
        if (this.done) {
          throw new Error('cannot advance a source that is done');
        } else {
          let { head, value } = this;

          let nextItem = head.next;

          if (!this.done) {
            if (!nextItem) {
              nextItem = exchange.fetch();
            }

            this.head = head = nextItem;
            this.prevValue = value;

            // TODO what if head.step is a promise?
            if (head.step?.done) {
              exchange.releaseSource(this);
            }
          }
        }

        this.index++;
        return this.head.step;
      });
    }, this.head.step);
  }

  branch() {
    const { exchange } = this;

    return exchange ? exchange.allocateSource(this) : this;
  }

  release() {
    const { exchange, head } = this;

    if (exchange) exchange.releaseSource(this);

    const step = { value: undefined, done: true };

    this.head = { ...head, step };

    return step;
  }

  accept(source) {
    this.head = source.head;
    this.index = source.index;
    this.holding = source.holding;
    this.prevValue = source.prevValue;

    source.release();
  }

  reject() {
    this.release();
  }

  [Symbol.iterator]() {
    return SourceIterator.from(this);
  }

  [streamIteratorSymbol]() {
    return SourceIterator.from(this);
  }

  formatIndex() {
    return `source[${this.source.index}]`;
  }
};
