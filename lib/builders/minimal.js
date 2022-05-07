const { Builder } = require('./base.js');

class MinimalBuilder extends Builder {
  *advance(token, optional = false) {
    if (!optional) {
      yield token.build();
    }
  }
}

module.exports = { MinimalBuilder };
