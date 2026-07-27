import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // db.ts usa server-only; em testes Node o pacote real quebra o import.
      'server-only': path.resolve(__dirname, './src/test/server-only-stub.ts'),
    },
  },
})
