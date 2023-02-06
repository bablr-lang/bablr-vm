import debug_ from 'debug';

export const debugGrammar = debug_('cst-tokens:grmr');
export const debugTree = debug_('cst-tokens:tree');
export const debugDesc = debug_('cst-tokens:desc');
export const debugTokenizer = debug_('cst-tokens:tokn');

debugGrammar.color = 77; // green
debugTree.color = 32; // blue
debugDesc.color = 208; // orange
debugTokenizer.color = 163; // magenta
