const debug_ = require('debug');

const debug = debug_('cst-tokens');
const debugTree = debug_('cst-tokens:tree');
const debugDesc = debug_('cst-tokens:desc');
const debugHoist = debug_('cst-tokens:hoist');
const debugSrc = debug_('cst-tokens:src');

debug.color = 77; // green
debugTree.color = 32; // blue
debugDesc.color = 208; // orange
debugHoist.color = 163; // magenta

module.exports = { debug, debugTree, debugDesc, debugHoist, debugSrc };
