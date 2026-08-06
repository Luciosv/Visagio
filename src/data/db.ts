// Capa de datos de la ficha de cliente (Fase 6a, sección 5 de CLAUDE.md).
// IndexedDB vía `idb` (sección 4: "idb (wrapper liviano de IndexedDB) para
// la ficha de cliente"), con esquema versionado y función de migración
// explícita desde el arranque (sección 6, regla 4: "IndexedDB con número de
// esquema y función de migración desde la primera versión, aunque la primera
// migración sea un no-op. Un cambio de esquema sin migración le borra los
// clientes, y ahí se termina la prueba").
//
// Funciones puras en el sentido de "una sola responsabilidad, testeables"
// (no en el sentido literal de `vision/`/`engine/`, sección 17: esto SÍ toca
// IndexedDB a propósito, es la capa de persistencia). Los tests
// (`db.test.ts`) corren contra `fake-indexeddb`, no contra un navegador real.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ClienteFicha, HistorialEntry, MorfologiaCliente } from '../types'

const DB_NAME = 'visagio'

/**
 * Número de esquema. CUALQUIER cambio de forma a un store existente —
 * agregar/sacar un índice, cambiar la forma de un campo guardado — tiene que
 * subir este número y agregar la migración correspondiente en `upgrade` de
 * abajo. Nunca hay que borrar y recrear un store con datos del barbero
 * adentro: eso le vuela la ficha de sus clientes (sección 6, regla 4).
 *
 * v1 (Fase 6a): store `fichas` con índice por `alias`.
 */
const DB_VERSION = 1

const FICHAS_STORE = 'fichas'
const ALIAS_INDEX = 'alias'

interface VisagioDBSchema extends DBSchema {
  [FICHAS_STORE]: {
    key: string
    value: ClienteFicha
    indexes: { [ALIAS_INDEX]: string }
  }
}

let dbPromise: Promise<IDBPDatabase<VisagioDBSchema>> | null = null

function getDb(): Promise<IDBPDatabase<VisagioDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<VisagioDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // v1: crea el store `fichas` con `id` como key y un índice por
        // `alias` (lo va a usar el buscador de la Fase 6b, sección 5:
        // "diseñar la pantalla de inicio alrededor de 'buscar cliente'").
        if (oldVersion < 1) {
          const store = db.createObjectStore(FICHAS_STORE, { keyPath: 'id' })
          store.createIndex(ALIAS_INDEX, 'alias')
        }

        // ACÁ ABAJO van los `if (oldVersion < N)` de futuras versiones del
        // esquema, en orden, cada uno migrando los registros que ya existen
        // (nunca `clear()`/recrear un store con datos adentro). Ninguno
        // todavía: esta es la v1, recién nace. Ejemplo de la forma que va a
        // tener cuando aparezca la v2:
        //
        // if (oldVersion < 2) {
        //   // agregar un índice nuevo, transformar registros existentes
        //   // con un cursor, etc.
        // }
      },
    })
  }
  return dbPromise
}

/**
 * Solo para tests: fuerza que la próxima llamada a cualquier función de este
 * módulo vuelva a abrir la conexión desde cero. Necesario porque
 * `fake-indexeddb` resetea su almacenamiento entre tests (`setupFiles` en
 * `vitest.config.ts`) pero el `dbPromise` cacheado de arriba sigue apuntando
 * a la conexión vieja si no se limpia.
 */
export function __resetDbConnectionForTests(): void {
  dbPromise = null
}

/** Datos necesarios para crear una ficha nueva (sección 10: alias pedido al tocar "Este hice" en el flujo de cliente nuevo). */
export interface CrearFichaInput {
  readonly alias: string
  readonly morfologia: MorfologiaCliente
  /** Primera entrada de historial, el corte que se acaba de elegir. */
  readonly primerHistorial: HistorialEntry
}

/** Crea una ficha nueva con un `id` propio (UUID) y la guarda. */
export async function crearFicha(input: CrearFichaInput): Promise<ClienteFicha> {
  const db = await getDb()
  const now = new Date().toISOString()
  const ficha: ClienteFicha = {
    id: crypto.randomUUID(),
    alias: input.alias,
    creadoEn: now,
    actualizadoEn: now,
    morfologia: input.morfologia,
    historial: [input.primerHistorial],
  }
  await db.put(FICHAS_STORE, ficha)
  return ficha
}

/**
 * Agrega una entrada de historial a una ficha existente (visita futura,
 * Fase 6b). Devuelve `undefined` si la ficha no existe (no debería pasar en
 * uso normal, pero no es responsabilidad de esta función decidir qué hacer
 * en ese caso — el llamador ve el `undefined` y reacciona).
 */
export async function agregarHistorial(
  fichaId: string,
  entry: HistorialEntry,
): Promise<ClienteFicha | undefined> {
  const db = await getDb()
  const existing = await db.get(FICHAS_STORE, fichaId)
  if (!existing) return undefined

  const updated: ClienteFicha = {
    ...existing,
    actualizadoEn: new Date().toISOString(),
    historial: [...existing.historial, entry],
  }
  await db.put(FICHAS_STORE, updated)
  return updated
}

/** Trae una ficha por `id`, o `undefined` si no existe. */
export async function obtenerFicha(id: string): Promise<ClienteFicha | undefined> {
  const db = await getDb()
  return db.get(FICHAS_STORE, id)
}

/**
 * Todas las fichas guardadas, ordenadas por `alias` (recorre el índice, no
 * el store por `id`) — el orden que le sirve directo al buscador de la Fase
 * 6b sin que tenga que ordenar de nuevo.
 */
export async function listarFichas(): Promise<ClienteFicha[]> {
  const db = await getDb()
  return db.getAllFromIndex(FICHAS_STORE, ALIAS_INDEX)
}

/** Cantidad de fichas guardadas, para la pantalla de "Datos y privacidad" (sección 5). */
export async function contarFichas(): Promise<number> {
  const db = await getDb()
  return db.count(FICHAS_STORE)
}

/** Borra TODAS las fichas. Para el botón "borrar todo" de "Datos y privacidad" (sección 5) — el llamador es responsable de pedir confirmación antes de invocar esto. */
export async function borrarTodasLasFichas(): Promise<void> {
  const db = await getDb()
  await db.clear(FICHAS_STORE)
}
