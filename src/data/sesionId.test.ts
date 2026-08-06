// Tests de `sesionId.ts` contra un stub de `localStorage` en memoria: el
// entorno `node` de Vitest (`vitest.config.ts`) no trae `localStorage` global
// (a diferencia de un navegador real), así que se instala un stub mínimo
// antes de cada test, en el mismo espíritu que `db.test.ts` instala
// `fake-indexeddb` para `indexedDB`.

import { beforeEach, describe, expect, it } from 'vitest'
import { __resetSesionIdCacheForTests, getSesionId } from './sesionId'

class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage()
  __resetSesionIdCacheForTests()
})

describe('getSesionId', () => {
  it('genera un UUID la primera vez y lo persiste en localStorage', () => {
    const id = getSesionId()

    expect(id).toBeTruthy()
    expect(localStorage.getItem('visagio:sesionId')).toBe(id)
  })

  it('devuelve el mismo id en llamadas siguientes (cache en memoria)', () => {
    const first = getSesionId()
    const second = getSesionId()

    expect(second).toBe(first)
  })

  it('reusa el id ya guardado en localStorage aunque se resetee la cache en memoria', () => {
    const first = getSesionId()
    __resetSesionIdCacheForTests()
    const second = getSesionId()

    expect(second).toBe(first)
  })

  it('si localStorage no tiene nada guardado (ej. Safari lo limpió), genera uno nuevo sin romper', () => {
    const first = getSesionId()
    localStorage.removeItem('visagio:sesionId')
    __resetSesionIdCacheForTests()

    const second = getSesionId()

    expect(second).toBeTruthy()
    expect(second).not.toBe(first)
  })
})
