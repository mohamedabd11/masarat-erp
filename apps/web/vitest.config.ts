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
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
