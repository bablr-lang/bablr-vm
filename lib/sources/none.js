const { Source } = require('./base.js');

class NoSource extends Source {
  *advance(token, optional = false) {
    if (!optional) {
      yield token.build();
    }
  }
}

module.exports = { NoSource };
