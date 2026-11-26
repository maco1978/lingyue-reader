import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/lingyue-reader/',
  test: { environment: 'node', globals: true },
});
