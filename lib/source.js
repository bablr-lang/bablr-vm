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
    const exchange = new Exchange(iterable);
    exchange.fetch();
    return exchange;
  }

  fork() {
    ++this.forks;
    return new Fork(this.tail, this);
  }

  cloneFork(fork) {
    const { head, exchange } = fork;
    ++this.forks;
    return new Fork(head, exchange);
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

  return() {
    --this.forks;
    if (this.forks === 0) {
      this.iterator.return?.();
    }
    return { value: undefined, done: true };
  }
}

class Fork {
  constructor(head, exchange) {
    this.head = head;
    this.exchange = exchange;
    this.done = false;
  }

  next() {
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

    if (!done) exchange.return();

    this.done = true;

    return { value: undefined, done: true };
  }

  [Symbol.iterator]() {
    return this;
  }
}

export class Source {
  static from(iterable) {
    const exchange = Exchange.from(iterable[Symbol.iterator]());
    return new Source(exchange.fork(), exchange);
  }

  constructor(fork, exchange) {
    this.fork = fork;
    this.exchange = exchange;
    this.index = 0;
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
      this.fork.next();
      this.index++;
    }
  }

  branch() {
    const { fork, exchange } = this;
    return new Source(exchange.cloneFork(fork), exchange);
  }

  release() {
    this.fork.return();
  }

  accept(forkerator) {
    this.release();
    this.fork = forkerator.fork;
  }

  reject() {
    this.release();
  }

  [Symbol.iterator]() {
    return this.exchange.fork();
  }

  formatIndex() {
    return `source[${this.source.index}]`;
  }
}
