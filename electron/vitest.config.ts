import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@calendar/sync-core': resolve(__dirname, '../shared/sync-core/src/index.ts') } },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
