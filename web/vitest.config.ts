import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Pure-logic unit tests for web/lib. No DOM needed (these modules are
// framework-free functions), so the default 'node' environment is fine.
export default defineConfig({
  resolve: {
    // Mirror tsconfig's "@/*" alias to the web root so imports resolve in tests.
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
