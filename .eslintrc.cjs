const fs = require('fs');
const { CachedInputFileSystem } = require('enhanced-resolve');

module.exports = {
  env: {
    browser: false,
    node: true,
    es2021: true,
  },
  extends: ['plugin:import/recommended'],
  overrides: [],
  parserOptions: {
    ecmaVersion: '2020',
    sourceType: 'module',
  },
  rules: {
    'no-undef': 'error',
  },
  settings: {
    'import/resolver': {
      'enhanced-resolve': {
        fileSystem: new CachedInputFileSystem(fs, 4000),
        conditionNames: ['import'],
      },
    },
  },
};
