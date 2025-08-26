import { buildDependentLanguages } from '@bablr/helpers/grammar';
import { facades, actuals } from './facades.js';
import { getPrototypeOf } from '@bablr/helpers/object';
import { states as nodeStates } from './node.js';
import { PathFacade as Path } from '@bablr/agast-vm';

import { sourceTextFor } from '@bablr/agast-helpers/stream';
import { streamFromTree } from '@bablr/agast-helpers/tree';
import { allTagsFor } from '@bablr/agast-helpers/path-facade';

export const ContextFacade = class BABLRContextFacade {
  constructor(actual) {
    facades.set(actual, this);
    Object.freeze(this);
  }

  get languages() {
    return actuals.get(this).languages;
  }

  get grammars() {
    return actuals.get(this).grammars;
  }

  get productionEnhancer() {
    return actuals.get(this).productionEnhancer;
  }

  // getCooked(nodeOrRange) {
  //   return isArray(nodeOrRange)
  //     ? getCookedFromStream(this.allTagsFor(nodeOrRange))
  //     : getCookedFromTree(nodeOrRange);
  // }

  sourceTextFor(node) {
    let fragmentStream;
    if (!node) return null;
    if (getPrototypeOf(node) === Object.prototype) {
      fragmentStream = streamFromTree(node);
    } else if (nodeStates.has(node)) {
      let state = nodeStates.get(node);
      let { tagsIndexRange } = state;
      let path = Path.from(state.fragmentNode);

      if (!tagsIndexRange) {
        let nodePath = Path.from(state.node);
        tagsIndexRange = [0, nodePath.tagPathAt(-1).tagsIndex];
      }

      fragmentStream = allTagsFor(
        [path.tagPathAt(tagsIndexRange[0], 0), path.tagPathAt(tagsIndexRange[1], -1)],
        { unshift: true },
      );
    } else {
      return null;
    }

    return fragmentStream && sourceTextFor(fragmentStream);
  }
};

export const Context = class BABLRContext {
  static from(language, productionEnhancer) {
    return new Context(buildDependentLanguages(language), productionEnhancer);
  }

  constructor(languages, productionEnhancer) {
    this.languages = languages;
    this.productionEnhancer = productionEnhancer;

    this.unboxedValues = new WeakMap();

    this.grammars = new WeakMap();
    this.facade = new ContextFacade(this);

    for (const { 1: language } of this.languages) {
      let { prototype } = language.grammar;
      while (prototype && prototype !== Object.prototype) {
        prototype = getPrototypeOf(prototype);
      }
      this.grammars.set(language, new language.grammar());
    }
  }
};
