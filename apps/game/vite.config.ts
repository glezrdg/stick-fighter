/// <reference types="vitest" />
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
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
