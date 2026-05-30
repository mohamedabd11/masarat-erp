import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals:     true,
    include:     ['src/**/__tests__/**/*.test.ts'],
    coverage:    { provider: 'v8', include: ['src/lib/**', 'src/app/api/**'] },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Resolve workspace package to its TypeScript source (vitest handles TS natively)
      '@masarat/travel-providers': path.resolve(__dirname, '../../packages/travel-providers/src/index.ts'),
    },
  },
  server: {
    fs: {
      // Allow imports from outside the web app root (workspace packages)
      allow: [path.resolve(__dirname, '../../packages')],
    },
  },
});
