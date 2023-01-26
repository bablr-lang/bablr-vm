import debug_ from 'debug';

export const debug = debug_('cst-tokens');
export const debugTree = debug_('cst-tokens:tree');
export const debugDesc = debug_('cst-tokens:desc');
export const debugTokenizer = debug_('cst-tokens:tokn');

debug.color = 77; // green
debugTree.color = 32; // blue
debugDesc.color = 208; // orange
debugTokenizer.color = 163; // magenta
