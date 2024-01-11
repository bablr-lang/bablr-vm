export class Resolver {
  constructor(counters = new Map()) {
    this.counters = counters;
  }

  consume(reference) {
    const { pathName, pathIsArray } = reference.value;
    const { counters } = this;
    let path = pathName;

    if (pathIsArray) {
      const count = counters.get(pathName) || 0;

      path += '.' + count;
      counters.set(pathName, count + 1);
    }

    return path;
  }

  resolve(reference) {
    let { pathName, pathIsArray } = reference.value;
    const { counters } = this;
    let path = pathName;

    if (pathIsArray) {
      const count = counters.get(pathName) || 0;

      path += '.' + count;
    }

    return path;
  }

  branch() {
    return new Resolver(new Map(this.counters));
  }

  accept(resolver) {
    this.counters = resolver.counters;

    return this;
  }
}
