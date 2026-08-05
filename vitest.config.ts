import { defineConfig } from 'vitest/config'

// Config separada de vite.config.ts: los tests de vision/ son funciones
// puras (números adentro, números afuera, sección 17 de CLAUDE.md), no
// necesitan jsdom ni los plugins de React/Tailwind del build de la app.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
