// Arma el `EventoFeedback` (Fase 7, sección 2.3 de CLAUDE.md). Función pura y
// testeable (sección 17): entran los datos ya disponibles en `ResultsContext`
// más lo que juntó la sesión de resultados (descartes, tiempo en pantalla),
// sale el objeto con el formato definitivo de 2.3.
//
// CRÍTICO, mismo criterio que `buildShareCardContent` en `shareCard.ts`: la
// firma de `buildFeedbackEvento` solo acepta los campos que la sección 2.3
// autoriza a mandar (ratios, forma, form del barbero, ranking/elegido/
// descartados de cortes, tiempo en pantalla). Es ESTRUCTURALMENTE imposible
// que se cuele una foto, un landmark crudo o el alias/nombre del cliente: no
// hay ningún parámetro por donde pasarlos. No agregar parámetros a esta
// función sin releer la sección 2.3 primero.

import type { BarberInput, CutDescartado, EventoFeedback, FaceShape, FaceShapeScore, FaceRatios } from '../types'

/** Todo lo que hace falta para armar un `EventoFeedback` al confirmar "Este hice". */
export interface BuildFeedbackEventoInput {
  /** UUID anónimo del dispositivo (`data/sesionId.ts`). */
  readonly sesion: string
  readonly ratios: FaceRatios
  /** Top-1 CRUDO de `classifyFaceShape`, igual criterio que `MorfologiaCliente.formaSugerida`. */
  readonly formaSugerida: FaceShapeScore
  /** `null` si el barbero no tocó el selector de forma (mismo criterio que `MorfologiaCliente.formaCorregida`). */
  readonly formaCorregida: FaceShape | null
  /** Delta normalizado del ajuste de nacimiento, o `null` si esta consulta no pasó por una foto nueva (ver comentario de `EventoFeedback` en `types.ts`). */
  readonly ajusteLineaNacimiento: number | null
  /** Solo `textura`/`densidad`/`flags`: el ejemplo de la sección 2.3 no incluye `minutosDeclarados` ni `largoActualArriba` en `form`. */
  readonly barberInput: Pick<BarberInput, 'textura' | 'densidad' | 'flags'>
  /** Ids de `Cut` en el orden completo del ranking de `recommendCuts` (mejor primero). */
  readonly ranking: readonly string[]
  /** Id del `Cut` confirmado con "Este hice". */
  readonly elegido: string
  readonly descartados: readonly CutDescartado[]
  readonly segundosEnPantalla: number
  /** Reloj inyectable para tests; por defecto `new Date()`. */
  readonly now?: () => Date
}

export function buildFeedbackEvento(input: BuildFeedbackEventoInput): EventoFeedback {
  const now = input.now ? input.now() : new Date()

  return {
    ts: now.toISOString(),
    sesion: input.sesion,
    ratios: input.ratios,
    formaSugerida: [input.formaSugerida.shape, input.formaSugerida.confidence],
    formaCorregida: input.formaCorregida,
    ajusteLineaNacimiento: input.ajusteLineaNacimiento,
    form: {
      textura: input.barberInput.textura,
      densidad: input.barberInput.densidad,
      flags: input.barberInput.flags,
    },
    ranking: input.ranking,
    elegido: input.elegido,
    descartados: input.descartados,
    segundosEnPantalla: input.segundosEnPantalla,
  }
}
