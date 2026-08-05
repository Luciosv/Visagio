// Copia los binarios WASM del runtime de @mediapipe/tasks-vision desde
// node_modules a public/models/wasm/, para que se sirvan self-hosted desde
// nuestro propio dominio (Cloudflare Pages) y no desde el CDN de Google
// (ver sección 4 y 6 de CLAUDE.md: nada de assets del pipeline de visión
// cargados en runtime desde un origen externo).
//
// Se corre como postinstall porque estos archivos vienen con el paquete
// npm instalado: no hace falta commitearlos al repo, se regeneran solos
// en cada `npm install` (incluido el build de Cloudflare Pages).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, '..', 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const destDir = join(here, '..', 'public', 'models', 'wasm')

const files = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]

if (!existsSync(srcDir)) {
  console.warn(`[copy-mediapipe-wasm] no se encontró ${srcDir}, se omite la copia.`)
  process.exit(0)
}

mkdirSync(destDir, { recursive: true })

for (const file of files) {
  const src = join(srcDir, file)
  const dest = join(destDir, file)
  if (!existsSync(src)) {
    console.warn(`[copy-mediapipe-wasm] falta ${src}, se omite.`)
    continue
  }
  copyFileSync(src, dest)
}

console.log(`[copy-mediapipe-wasm] wasm copiado a ${destDir}`)
