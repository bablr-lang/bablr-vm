import { concat } from 'iter-tools-es';
import { Grammar } from '@cst-tokens/grammar';
import { objectEntries } from '@cst-tokens/helpers/object';

export const Any = Symbol('Any');
export const All = Symbol('All');

export class GoodGrammar extends Grammar {
  constructor(grammar) {
    const { Any, All } = GoodGrammar;
    const { productions } = grammar;
    super({
      ...grammar,
      productions: concat(
        productions,
        objectEntries({
          *[Any]({ takeables }) {
            for (const takeable of takeables) {
              if (yield eatMatch(takeable)) break;
            }
          },

          *[All]({ takeables }) {
            for (const takeable of takeables) {
              yield eat(takeable);
            }
          },

          // *[Plus]() {

          // }
        }),
      ),
    });
  }
}
