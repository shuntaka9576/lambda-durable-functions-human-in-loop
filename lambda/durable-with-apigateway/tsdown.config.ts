import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  outDir: 'dist',
  shims: true,
  platform: 'node',
  noExternal: ['@aws/durable-execution-sdk-js'],
  external: [/@aws-sdk\//, /@smithy\//],
});
