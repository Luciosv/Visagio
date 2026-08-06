// UUID anónimo de sesión/dispositivo para la cola de feedback (sección 2.3 de
// CLAUDE.md: `"sesion": "uuid-anónimo-del-dispositivo"`). Se genera una sola
// vez con `crypto.randomUUID()` y se persiste en `localStorage`, no en
// IndexedDB: la sección 2.1 desaconseja `localStorage` para lo que PESA
// (fotos, fichas de cliente con historial), pero un string de 36 caracteres
// no tiene ese problema — no hace falta la maquinaria de `idb`/`db.ts` para
// esto.
//
// Si Safari llega a borrar este valor (sección 2.1: `localStorage` puede
// limpiarse tras ~7 días sin uso del sitio), la próxima llamada simplemente
// genera un UUID nuevo: no rompe nada, solo se deja de poder correlacionar
// eventos viejos con nuevos bajo la misma "sesión". No es un identificador de
// PERSONA — es un identificador de instalación/dispositivo, mismo criterio
// que el "nunca" de la sección 2.3 (nunca nombre del cliente, nunca nada que
// identifique a una persona).

const SESION_ID_KEY = 'visagio:sesionId'

let cachedSesionId: string | null = null

/** Devuelve el UUID anónimo de esta instalación, generándolo y persistiéndolo la primera vez que se llama. */
export function getSesionId(): string {
  if (cachedSesionId) return cachedSesionId

  const stored = localStorage.getItem(SESION_ID_KEY)
  if (stored) {
    cachedSesionId = stored
    return stored
  }

  const fresh = crypto.randomUUID()
  localStorage.setItem(SESION_ID_KEY, fresh)
  cachedSesionId = fresh
  return fresh
}

/** Solo para tests: limpia la cache en memoria para que la próxima llamada vuelva a leer (o generar) desde `localStorage`. */
export function __resetSesionIdCacheForTests(): void {
  cachedSesionId = null
}
