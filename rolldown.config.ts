import { defineConfig } from 'rolldown';

export default defineConfig({
  input: 'src/extension.ts',
  platform: 'node',
  external: ['vscode'],
  tsconfig: './tsconfig.json',
  transform: {
    target: 'node14', // VSCode 1.63 is based on Node.js 14.x
  },
  output: {
    dir: 'out',
    entryFileNames: 'extension.js',
    format: 'cjs',
    sourcemap: false,
    cleanDir: true,
  },
});
