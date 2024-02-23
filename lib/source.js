import { WeakStackFrame } from '@bablr/weak-stack';
import { facades, actuals } from './facades.js';

// Queue item instances are shared between all forks.
class QueueItem {
  constructor(step) {
    this.step = step;
    this.next = null;
  }
}

class Exchange {
  constructor(iterator) {
    this.iterator = iterator;
    this.tail = new QueueItem(null);
    this.head = this.tail;
    this.forks = 0;
  }

  static from(iterable) {
    return new Exchange(iterable[Symbol.iterator]());
  }

  allocateFork(fork) {
    const { head = this.tail, exchange = this, current } = fork || {};
    ++this.forks;
    return new Fork(head, exchange, current);
  }

  advance() {
    this.tail = this.tail.next;
  }

  fetch() {
    const step = this.iterator.next();
    const newItem = new QueueItem(step);
    this.head.next = this.head = newItem;
    return step;
  }

  releaseFork(fork) {
    --this.forks;
    if (this.forks === 0) {
      this.iterator.return?.();
    }
    return { value: undefined, done: true };
  }
}

class ForkIterator {
  constructor(fork) {
    facades.set(fork.clone(), this);
  }

  next() {
    const fork = actuals.get(this);
    if (!fork.done) {
      const { head } = fork;
      fork.advance();
      return head.step;
    } else {
      return { value: undefined, done: true };
    }
  }

  return() {
    actuals.get(this).return();
    return { value: undefined, done: true };
  }

  [Symbol.iterator]() {
    return this;
  }
}

class Fork {
  constructor(head, exchange, done = false) {
    this.head = head; // QueueItem
    this.exchange = exchange;
    this._done = done;
  }

  get done() {
    return this._done || this.head.step?.done;
  }

  get value() {
    return this.done ? { value: undefined, done: true } : this.head.step?.value;
  }

  advance() {
    const { exchange } = this;

    if (this.done) {
      throw new Error('cannot advance a fork that is done');
    } else {
      let { head } = this;

      if (!head.next) {
        exchange.fetch();
      }

      if (!head.step?.done) {
        this.head = head.next;
      }

      return this.head.step;
    }
  }

  return() {
    const { done, exchange } = this;

    if (!done) exchange.releaseFork(this);

    const step = { value: undefined, done: true };

    this._current = step;

    return step;
  }

  clone() {
    const { exchange } = this;

    return exchange.allocateFork(this);
  }

  [Symbol.iterator]() {
    return new ForkIterator(this);
  }
}

export class SourceFacade {
  static from(iterable) {
    return facades.get(Source.from(iterable));
  }

  constructor(source) {
    facades.set(source, this);
  }

  [Symbol.iterator]() {
    return actuals.get(this)[Symbol.iterator]();
  }

  get index() {
    return actuals.get(this).index;
  }
}

export class Source extends WeakStackFrame {
  static from(iterable) {
    const exchange = Exchange.from(iterable);
    const source = Source.create(exchange.allocateFork(), exchange);

    source.advance();

    return source;
  }

  constructor(fork, exchange, index = -1) {
    super();

    this.fork = fork;
    this.exchange = exchange;
    this.index = index;

    new SourceFacade(this);
  }

  get value() {
    return this.fork.value;
  }

  get done() {
    return this.fork.done;
  }

  get atGap() {
    return !this.done && this.value == null;
  }

  advance(n = 1) {
    for (let i = 0; i < n; i++) {
      this.fork.advance();
      this.index++;
    }
  }

  branch() {
    const { fork, exchange, index } = this;
    return this.push(exchange.allocateFork(fork), exchange, index);
  }

  release() {
    this.fork.return();
  }

  accept(source) {
    this.release();
    this.fork = source.fork;
    this.index = source.index;
  }

  reject() {
    this.release();
  }

  *[Symbol.iterator]() {
    for (let chr of this.fork) {
      if (chr == null) break;
      yield chr;
    }
  }

  formatIndex() {
    return `source[${this.source.index}]`;
  }
}
