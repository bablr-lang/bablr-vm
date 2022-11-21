module.exports = {
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  rules: {
    'no-undef': 'error',
  },
  globals: {
    require: 'readonly',
    module: 'readonly',
    Map: 'readonly',
    Set: 'readonly',
    WeakMap: 'readonly',
    Symbol: 'readonly',
    process: 'readonly',
  },
};
