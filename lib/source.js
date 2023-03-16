import { _actual } from './symbols.js';

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
    const { head = this.tail, exchange = this, done } = fork || {};
    ++this.forks;
    return new Fork(head, exchange, done);
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
    this[_actual] = fork.clone();
  }

  next() {
    const fork = this[_actual];
    const { head } = fork;
    fork.advance();
    return head.step;
  }

  return() {
    this[_actual].return();
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
    this.done = done;
  }

  advance() {
    const { done, exchange } = this;

    if (done) {
      return { value: undefined, done };
    } else {
      let { head } = this;

      if (!head.next) exchange.fetch();

      head = head.next;
      const { step } = head;

      this.done = step.done;
      this.head = head;

      return step;
    }
  }

  return() {
    const { done, exchange } = this;

    if (!done) exchange.releaseFork(this);

    this.done = true;

    return { value: undefined, done: true };
  }

  clone() {
    const { exchange } = this;

    return exchange.allocateFork(this);
  }

  [Symbol.iterator]() {
    return new ForkIterator(this);
  }
}

export class Source {
  static from(iterable) {
    const exchange = Exchange.from(iterable);
    const source = new Source(exchange.allocateFork(), exchange);
    source.advance();
    return source;
  }

  constructor(fork, exchange, index = 0) {
    this.fork = fork;
    this.exchange = exchange;
    this.index = index;
  }

  get current() {
    return this.fork.head.step;
  }

  get value() {
    return this.current.value;
  }

  get done() {
    return this.current.done;
  }

  advance(n = 1) {
    for (let i = 0; i < n; i++) {
      this.fork.advance();
      this.index++;
    }
  }

  branch() {
    const { fork, exchange, index } = this;
    return new Source(exchange.allocateFork(fork), exchange, index);
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

  [Symbol.iterator]() {
    return this.fork[Symbol.iterator]();
  }

  formatIndex() {
    return `source[${this.source.index}]`;
  }
}
