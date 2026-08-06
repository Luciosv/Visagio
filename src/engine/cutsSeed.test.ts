// Valida que `public/data/cuts.seed.json` (Fase 4, sección 8 de CLAUDE.md) es
// JSON válido y que los 15 cortes tienen la forma que `Cut` (src/types.ts)
// espera. Se lee con `fs.readFileSync` + `JSON.parse` en vez de un `import`
// de módulo a propósito: en runtime la app lo pide con `fetch` como texto
// plano (sección 6: "los datos separados del código... se pide en runtime
// con fetch, no se importa en el bundle"), así que el test ejercita el mismo
// camino (parsear texto), no el de un bundler resolviendo un JSON module.
//
// `node:fs`/`node:url` no tienen tipos globales bajo `tsconfig.app.json`
// (que restringe `types` a `["vite/client"]` para no filtrar globals de Node
// al código de browser) — de ahí el `/// <reference types="node" />`
// explícito, que trae los tipos de `@types/node` solo para este archivo de
// test sin tocar la config del resto de la app.

/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Cut } from '../types'
import { CLIENT_FLAGS, CUT_LENGTHS, FACE_SHAPES, HAIR_DENSITIES, HAIR_TEXTURES } from '../types'

const CUTS_SEED_PATH = fileURLToPath(new URL('../../public/data/cuts.seed.json', import.meta.url))

const EXPECTED_IDS = [
  'rapado',
  'crew',
  'taper-bajo',
  'low-fade',
  'mid-fade',
  'high-fade',
  'french-crop',
  'undercut',
  'side-part',
  'pompadour',
  'capas-medias',
  'mullet',
  'rulos-en-capas',
  'largo-en-capas',
  'top-knot',
]

function loadCutsSeed(): unknown {
  const raw = readFileSync(CUTS_SEED_PATH, 'utf-8')
  return JSON.parse(raw)
}

describe('cuts.seed.json', () => {
  it('es JSON válido y es un array de 15 elementos', () => {
    const data = loadCutsSeed()
    expect(Array.isArray(data)).toBe(true)
    expect((data as unknown[]).length).toBe(15)
  })

  it('trae exactamente los 15 cortes de la sección 8, sin duplicados', () => {
    const cuts = loadCutsSeed() as Cut[]
    const ids = cuts.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.sort()).toEqual([...EXPECTED_IDS].sort())
  })

  it('cada corte tiene todos los campos requeridos con el tipo esperado', () => {
    const cuts = loadCutsSeed() as Cut[]

    for (const cut of cuts) {
      expect(typeof cut.id).toBe('string')
      expect(typeof cut.nombre).toBe('string')
      expect(CUT_LENGTHS).toContain(cut.longitud)

      expect(Object.keys(cut.afinidadForma).sort()).toEqual([...FACE_SHAPES].sort())
      for (const shape of FACE_SHAPES) {
        expect(cut.afinidadForma[shape]).toBeGreaterThanOrEqual(0)
        expect(cut.afinidadForma[shape]).toBeLessThanOrEqual(5)
      }

      expect(Object.keys(cut.afinidadTextura).sort()).toEqual([...HAIR_TEXTURES].sort())
      for (const textura of HAIR_TEXTURES) {
        expect(cut.afinidadTextura[textura]).toBeGreaterThanOrEqual(0)
        expect(cut.afinidadTextura[textura]).toBeLessThanOrEqual(5)
      }

      expect(Object.keys(cut.afinidadDensidad).sort()).toEqual([...HAIR_DENSITIES].sort())
      for (const densidad of HAIR_DENSITIES) {
        expect(cut.afinidadDensidad[densidad]).toBeGreaterThanOrEqual(0)
        expect(cut.afinidadDensidad[densidad]).toBeLessThanOrEqual(5)
      }

      expect(Array.isArray(cut.favorece)).toBe(true)
      expect(Array.isArray(cut.penaliza)).toBe(true)
      for (const flag of [...cut.favorece, ...cut.penaliza]) {
        expect(CLIENT_FLAGS).toContain(flag)
      }

      expect(typeof cut.spec.costados).toBe('string')
      expect(typeof cut.spec.arriba).toBe('string')
      expect(typeof cut.spec.nuca).toBe('string')
      expect(typeof cut.spec.contorno).toBe('string')

      expect(Array.isArray(cut.pasos)).toBe(true)
      expect(cut.pasos.length).toBeGreaterThan(0)
      expect(Array.isArray(cut.cuidados)).toBe(true)
      expect(cut.cuidados.length).toBeGreaterThan(0)

      expect(typeof cut.mantenimientoSemanas).toBe('number')
      expect(typeof cut.minutosDePeinado).toBe('number')
      expect(cut.dificultad).toBeGreaterThanOrEqual(1)
      expect(cut.dificultad).toBeLessThanOrEqual(5)
      expect(typeof cut.tiempoEjecucionMin).toBe('number')

      // Todos sin verificar todavía (sección 8): recién se pasan a `true` en
      // Fase 7, uno por uno, con el barbero corrigiendo los datos.
      expect(cut.verificado).toBe(false)

      expect(typeof cut.imagenes.tresCuartos).toBe('string')
      expect(typeof cut.imagenes.posterior).toBe('string')
    }
  })

  it('cubre los tres valores de longitud (no quedó ninguno vacío)', () => {
    const cuts = loadCutsSeed() as Cut[]
    const longitudes = new Set(cuts.map((c) => c.longitud))
    expect(longitudes).toEqual(new Set(CUT_LENGTHS))
  })
})
