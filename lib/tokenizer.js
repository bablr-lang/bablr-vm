import { freezeSeal } from './utils/object.js';
import { createToken } from './utils/token.js';
import { _actual } from './symbols.js';

export class Tokenizer {
  push(token) {
    const prevToken = this.token;

    freezeSeal(token);

    this.token = token;

    this.prevTokensByToken.set(token, prevToken);

    return token;
  }
}
