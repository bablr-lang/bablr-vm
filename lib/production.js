export class Production {
  constructor(grammar, type, value) {
    this.grammar = grammar;
    this.type = type;
    this.value = value;
  }

  static from(context, matchable) {
    const { grammars } = context;
    const grammar = grammars.get(matchable.type);
    const { type } = matchable.production;

    return new Production(grammar, type, grammar.get(type));
  }
}
