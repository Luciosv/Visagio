// Tests de la capa de datos de la ficha de cliente (Fase 6a, sección 5 de
// CLAUDE.md) contra `fake-indexeddb`: el estándar para testear código de
// IndexedDB sin un navegador real (`environment: 'node'` en
// `vitest.config.ts`, igual que el resto de los tests puros del repo).
//
// Antes de cada test se reemplaza `globalThis.indexedDB` por una `IDBFactory`
// nueva (en vez de solo `deleteDatabase`) para que cada test arranque de una
// base completamente vacía, sin rastro del test anterior — y se resetea la
// conexión cacheada de `db.ts` con `__resetDbConnectionForTests`, que si no
// seguiría apuntando a la conexión vieja.

import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import type { HistorialEntry, MorfologiaCliente } from '../types'
import {
  __resetDbConnectionForTests,
  agregarHistorial,
  borrarTodasLasFichas,
  contarFichas,
  crearFicha,
  listarFichas,
  obtenerFicha,
} from './db'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  __resetDbConnectionForTests()
})

function buildMorfologia(): MorfologiaCliente {
  return {
    formaSugerida: { shape: 'alargada', rawScore: 0.61, confidence: 0.61 },
    formaCorregida: null,
    ratios: { r1: 1.62, r2: 0.88, r3: 0.94, r4: 118, r5: 0.33, r6: { frente: 0.34, nariz: 0.33, menton: 0.33 } },
    flags: ['remolino_coronilla'],
  }
}

function buildHistorial(overrides: Partial<HistorialEntry> = {}): HistorialEntry {
  return {
    fecha: '2026-08-06T14:22:00.000Z',
    corteId: 'taper-bajo',
    corteNombre: 'Taper bajo',
    spec: { costados: 'degradado a #2', arriba: '4-6 cm', nuca: 'degradado bajo', contorno: 'difuminado' },
    ...overrides,
  }
}

describe('crearFicha', () => {
  it('guarda una ficha nueva con id propio y la primera entrada de historial', async () => {
    const ficha = await crearFicha({
      alias: 'Juan (campera roja)',
      morfologia: buildMorfologia(),
      primerHistorial: buildHistorial(),
    })

    expect(ficha.id).toBeTruthy()
    expect(ficha.alias).toBe('Juan (campera roja)')
    expect(ficha.historial).toHaveLength(1)
    expect(ficha.historial[0].corteId).toBe('taper-bajo')
    expect(ficha.creadoEn).toBe(ficha.actualizadoEn)

    const fromDb = await obtenerFicha(ficha.id)
    expect(fromDb).toEqual(ficha)
  })
})

describe('agregarHistorial', () => {
  it('agrega una entrada nueva a una ficha existente y actualiza actualizadoEn', async () => {
    const ficha = await crearFicha({
      alias: 'Marcos',
      morfologia: buildMorfologia(),
      primerHistorial: buildHistorial(),
    })

    const nuevaEntrada = buildHistorial({ fecha: '2026-09-01T10:00:00.000Z', corteId: 'french-crop', corteNombre: 'French crop' })
    const updated = await agregarHistorial(ficha.id, nuevaEntrada)

    expect(updated).toBeDefined()
    expect(updated?.historial).toHaveLength(2)
    expect(updated?.historial[1].corteId).toBe('french-crop')
    // No se compara con `!==` contra `ficha.creadoEn`: ambas llamadas pueden
    // caer en el mismo milisegundo bajo `fake-indexeddb` (sin latencia real
    // de disco de por medio), así que alcanza con que no haya retrocedido.
    expect(new Date(updated?.actualizadoEn ?? 0).getTime()).toBeGreaterThanOrEqual(
      new Date(ficha.creadoEn).getTime(),
    )

    const fromDb = await obtenerFicha(ficha.id)
    expect(fromDb?.historial).toHaveLength(2)
  })

  it('devuelve undefined si la ficha no existe', async () => {
    const result = await agregarHistorial('id-inexistente', buildHistorial())
    expect(result).toBeUndefined()
  })
})

describe('obtenerFicha', () => {
  it('devuelve undefined para un id que no existe', async () => {
    const result = await obtenerFicha('no-existe')
    expect(result).toBeUndefined()
  })
})

describe('listarFichas', () => {
  it('devuelve todas las fichas ordenadas por alias', async () => {
    await crearFicha({ alias: 'Zeta', morfologia: buildMorfologia(), primerHistorial: buildHistorial() })
    await crearFicha({ alias: 'Alfa', morfologia: buildMorfologia(), primerHistorial: buildHistorial() })
    await crearFicha({ alias: 'Medio', morfologia: buildMorfologia(), primerHistorial: buildHistorial() })

    const fichas = await listarFichas()
    expect(fichas.map((f) => f.alias)).toEqual(['Alfa', 'Medio', 'Zeta'])
  })

  it('devuelve un array vacío si no hay fichas', async () => {
    const fichas = await listarFichas()
    expect(fichas).toEqual([])
  })
})

describe('contarFichas', () => {
  it('cuenta las fichas guardadas', async () => {
    expect(await contarFichas()).toBe(0)
    await crearFicha({ alias: 'Uno', morfologia: buildMorfologia(), primerHistorial: buildHistorial() })
    await crearFicha({ alias: 'Dos', morfologia: buildMorfologia(), primerHistorial: buildHistorial() })
    expect(await contarFichas()).toBe(2)
  })
})

describe('borrarTodasLasFichas', () => {
  it('deja el store en cero', async () => {
    await crearFicha({ alias: 'Uno', morfologia: buildMorfologia(), primerHistorial: buildHistorial() })
    await crearFicha({ alias: 'Dos', morfologia: buildMorfologia(), primerHistorial: buildHistorial() })
    expect(await contarFichas()).toBe(2)

    await borrarTodasLasFichas()

    expect(await contarFichas()).toBe(0)
    expect(await listarFichas()).toEqual([])
  })
})
