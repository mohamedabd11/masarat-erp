import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals:     true,
    include:     ['src/**/__tests__/**/*.test.ts'],
    coverage:    { provider: 'v8', include: ['src/lib/**', 'src/app/api/**'] },
    server: {
      deps: {
        // Inline workspace packages so Vitest transforms their TypeScript source
        // even when they appear as node_modules symlinks in CI.
        inline: [/@masarat\//],
      },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});

