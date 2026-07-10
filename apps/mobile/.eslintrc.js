// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: 'expo',
  ignorePatterns: ['/dist', '/.expo', '/node_modules'],
  overrides: [
    {
      // Build config files run in Node/CommonJS, where __dirname, module and
      // require are legitimate globals (otherwise flagged no-undef).
      files: ['*.config.js', 'metro.config.js', 'babel.config.js'],
      env: { node: true },
    },
  ],
};
