import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/suite/**/*.test.js',
  download: {
    timeout: 120000,
  },
  mocha: {
    timeout: 20000,
  },
});
