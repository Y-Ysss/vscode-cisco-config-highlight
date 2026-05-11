import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { defineConfig } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';

export default defineConfig([
  {
    input: 'src/extension.ts',
    output: {
      dir: 'out',
      format: 'cjs',
      sourcemap: false,
    },
    plugins: [
      commonjs(),
      nodeResolve(),
      esbuild({
        target: 'node21',
        sourceMap: false,
      }),
    ],
    external: ['vscode'],
  },
]);
