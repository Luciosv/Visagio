// Motor de recomendación (Fase 4, sección 9 de CLAUDE.md). Función pura y
// testeable (sección 17: "engine/ con funciones puras y testeables: entran
// números, salen números. Nada de DOM ahí adentro"): entran la clasificación
// de forma de cara (Fase 3), el form de 5 taps del barbero (7.7 + el quinto
// tap de largo actual agregado en Fase 5, ver `types.ts`) y la base de
// cortes (`cuts.seed.json`, se carga con `fetch` en runtime — cargarlo es
// responsabilidad de quien llame a esta función, no de acá, para mantenerla
// pura), sale el ranking COMPLETO de cortes puntuados (la Fase 5 decide
// cuántos mostrar y cómo filtrar por longitud).
//
// "Camino en 2-3 cortes" (sección 9): un corte que puntúa alto pero necesita
// más largo del que el cliente tiene hoy (`cut.largoMinimoArribaCm` mayor al
// máximo del bucket de `barberInput.largoActualArriba`) NO se descarta del
// ranking ni se le toca el score — sigue puntuado y ordenado igual que
// cualquier otro. Se lo marca aparte con `caminoEnVariosCortes: true` para
// que la Fase 5 lo muestre distinto ("camino en 2-3 cortes") en vez de
// esconderlo o de recomendarlo como si fuera ejecutable hoy mismo.

import type { BarberInput, Cut, CutRecommendation, CutScoreBreakdown, FaceShapeClassification } from '../types'
import { LARGO_ACTUAL_ARRIBA_MAX_CM } from './largoActualArribaThresholds'
import {
  W1_FORMA_TOP1,
  W2_FORMA_TOP2,
  W3_TEXTURA,
  W4_DENSIDAD,
  W5_BONUS_FAVORECE,
  W6_PENALIZACION_PENALIZA,
  W7_PENALIZACION_PEINADO,
} from './recommendWeights'

/**
 * Puntúa y ordena todos los cortes de `cuts` según la fórmula de la sección
 * 9. Devuelve el ranking COMPLETO (no solo el top-N), de mayor a menor
 * score, con el desglose de cada término para que `explain.ts` pueda citar
 * el motivo concreto sin recalcular nada.
 */
export function recommendCuts(
  cuts: readonly Cut[],
  faceShape: FaceShapeClassification,
  barberInput: BarberInput,
): readonly CutRecommendation[] {
  return cuts
    .map((cut) => scoreCut(cut, faceShape, barberInput))
    .sort((a, b) => b.score - a.score)
}

/** Puntúa un único corte. Separado de `recommendCuts` para poder testear el desglose de un caso puntual sin armar un array. */
export function scoreCut(cut: Cut, faceShape: FaceShapeClassification, barberInput: BarberInput): CutRecommendation {
  const { top1, top2 } = faceShape

  const formaTop1 = W1_FORMA_TOP1 * cut.afinidadForma[top1.shape] * top1.confidence
  const formaTop2 = W2_FORMA_TOP2 * cut.afinidadForma[top2.shape] * top2.confidence
  const textura = W3_TEXTURA * cut.afinidadTextura[barberInput.textura]
  const densidad = W4_DENSIDAD * cut.afinidadDensidad[barberInput.densidad]

  const favoreceCoincidentes = cut.favorece.filter((flag) => barberInput.flags.includes(flag))
  const penalizaCoincidentes = cut.penaliza.filter((flag) => barberInput.flags.includes(flag))
  const bonusFavorece = W5_BONUS_FAVORECE * favoreceCoincidentes.length
  const penalizacionPenaliza = W6_PENALIZACION_PENALIZA * penalizaCoincidentes.length

  const minutosExceso = Math.max(0, cut.minutosDePeinado - barberInput.minutosDeclarados)
  const penalizacionPeinado = W7_PENALIZACION_PEINADO * minutosExceso

  const breakdown: CutScoreBreakdown = {
    formaTop1,
    formaTop2,
    textura,
    densidad,
    bonusFavorece,
    penalizacionPenaliza,
    penalizacionPeinado,
    favoreceCoincidentes,
    penalizaCoincidentes,
    minutosExceso,
  }

  const score =
    formaTop1 + formaTop2 + textura + densidad + bonusFavorece - penalizacionPenaliza - penalizacionPeinado

  const caminoEnVariosCortes = cut.largoMinimoArribaCm > LARGO_ACTUAL_ARRIBA_MAX_CM[barberInput.largoActualArriba]

  return { cut, score, breakdown, caminoEnVariosCortes }
}
