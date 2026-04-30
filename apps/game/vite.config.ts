/// <reference types="vitest" />
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  resolve: {
    // Resuelve `@stick/shared` a sus fuentes TS en dev/build de Vite — el
    // export `"source"` apunta a src/index.ts. Los consumidores Node (apps/api)
    // usan el `import`/`default` que apunta a dist/.
    conditions: ['source'],
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    globals: false,
    // happy-dom by default; pure-logic tests can opt out via
    // `// @vitest-environment node` at the top of the file.
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
