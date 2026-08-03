import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Vários testes fazem `await import('@/lib/...')` dentro do próprio caso.
    // O custo de transformar o módulo entra no orçamento do teste, e 5s (padrão)
    // estoura em máquina carregada ou em runner de CI.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // db.ts usa server-only; em testes Node o pacote real quebra o import.
      'server-only': path.resolve(__dirname, './src/test/server-only-stub.ts'),
    },
  },
})
