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
import type { ClienteFicha, EventoFeedback, HistorialEntry, MorfologiaCliente } from '../types'

const DB_NAME = 'visagio'

/**
 * Número de esquema. CUALQUIER cambio de forma a un store existente —
 * agregar/sacar un índice, cambiar la forma de un campo guardado — tiene que
 * subir este número y agregar la migración correspondiente en `upgrade` de
 * abajo. Nunca hay que borrar y recrear un store con datos del barbero
 * adentro: eso le vuela la ficha de sus clientes (sección 6, regla 4).
 *
 * v1 (Fase 6a): store `fichas` con índice por `alias`.
 * v2 (Fase 7): + store `eventosFeedback` (sección 2.3), AGREGADO al lado del
 * de `fichas` — el `if (oldVersion < 1)` de abajo queda intacto, así que una
 * base que ya venía en v1 con fichas cargadas las conserva sin tocarlas y
 * solo gana el store nuevo vacío (sección 6, regla 4: "un cambio de esquema
 * sin migración le borra los clientes, y ahí se termina la prueba").
 */
const DB_VERSION = 2

const FICHAS_STORE = 'fichas'
const ALIAS_INDEX = 'alias'
const EVENTOS_FEEDBACK_STORE = 'eventosFeedback'

interface VisagioDBSchema extends DBSchema {
  [FICHAS_STORE]: {
    key: string
    value: ClienteFicha
    indexes: { [ALIAS_INDEX]: string }
  }
  [EVENTOS_FEEDBACK_STORE]: {
    /**
     * Key autogenerada (no hay ningún campo natural único en `EventoFeedback`
     * — a propósito, sección 2.3: son "números sueltos", no llevan id de
     * cliente). Solo se insertan eventos, nunca se actualizan (mismo
     * criterio que el backend previsto de v1.1, sección 2.3: "política RLS
     * de solo INSERT"), así que alcanza con una key autoincremental interna.
     */
    key: number
    value: EventoFeedback
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

        // v2 (Fase 7): crea el store `eventosFeedback` de la cola de
        // feedback (sección 2.3). Puramente ADITIVO: no toca el store
        // `fichas` de la v1 para nada, así que una base existente con
        // clientes cargados llega acá con sus fichas intactas y solo suma el
        // store nuevo, vacío.
        if (oldVersion < 2) {
          db.createObjectStore(EVENTOS_FEEDBACK_STORE, { autoIncrement: true })
        }

        // ACÁ ABAJO van los `if (oldVersion < N)` de futuras versiones del
        // esquema, en orden, cada uno migrando los registros que ya existen
        // (nunca `clear()`/recrear un store con datos adentro).
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

// ---------------------------------------------------------------------------
// Cola de feedback (Fase 7, sección 2.3 de CLAUDE.md, v2 del esquema de
// arriba). El evento ya viene armado por `engine/feedback.ts` — este módulo
// solo lo persiste, no arma nada: la validación de "nunca una foto, nunca un
// alias" vive en la firma de `buildFeedbackEvento`, no acá.
// ---------------------------------------------------------------------------

/** Agrega un evento a la cola de feedback. Solo INSERT (`db.add`, no `put`): un evento nunca se actualiza, mismo criterio que el backend insert-only previsto para v1.1. */
export async function registrarEventoFeedback(evento: EventoFeedback): Promise<void> {
  const db = await getDb()
  await db.add(EVENTOS_FEEDBACK_STORE, evento)
}

/** Todos los eventos de feedback guardados, para el botón "Exportar todo" de "Datos y privacidad" (sección 5). */
export async function listarEventosFeedback(): Promise<EventoFeedback[]> {
  const db = await getDb()
  return db.getAll(EVENTOS_FEEDBACK_STORE)
}

/** Cantidad de eventos de feedback guardados, para la pantalla de "Datos y privacidad" (sección 5). */
export async function contarEventosFeedback(): Promise<number> {
  const db = await getDb()
  return db.count(EVENTOS_FEEDBACK_STORE)
}

/** Borra TODOS los eventos de feedback. Para el botón "borrar todo" de "Datos y privacidad" (sección 5) — el llamador es responsable de pedir confirmación antes de invocar esto. */
export async function borrarTodosLosEventos(): Promise<void> {
  const db = await getDb()
  await db.clear(EVENTOS_FEEDBACK_STORE)
}
