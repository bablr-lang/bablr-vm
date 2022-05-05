class Builder {
  *ensure(...tokens) {
    for (const token of tokens) {
      yield* token.type === 'Thunk' ? token.ensure(this) : this.advance(token);
    }
  }

  *allow(...tokens) {
    for (const token of tokens) {
      yield* token.type === 'Thunk' ? token.allow(this) : this.advance(token, true);
    }
  }

  advance() {
    throw new Error('Not implemented');
  }
}

class MinimalBuilder extends Builder {
  *advance(_, optional = false) {
    if (!optional) {
      yield token.build();
    }
  }
}

class ReprintBuilder extends Builder {
  constructor(tokens) {
    this.tokenPeekr = peekerate(tokens);
  }

  *advance(token, optional = false) {
    let { tokenPeekr: peekr } = this;

    if (peekr && token.match(peekr.value)) {
      const { value } = peekr;
      peekr.advance();
      yield value;
    } else if (!optional) {
      this.tokenPeekr = peekr = null;

      yield token.build();
    }
  }
}

class SourceBuilder extends Builder {
  *advance(token, optional = false) {
    // ...
  }
}

module.exports = { MinimalBuilder, ReprintBuilder, SourceBuilder };
