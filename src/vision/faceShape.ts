// Clasificación difusa de forma de cara (Fase 3, sección 7.6 de CLAUDE.md).
// Función pura y testeable (sección 17: "vision/ y engine/ con funciones
// puras y testeables: entran números, salen números. Nada de DOM ahí
// adentro"): entra `FaceRatios` (ya calculado por `metrics.ts`), sale un
// puntaje difuso de las 7 formas clásicas.
//
// "Reglas con puntaje difuso, no un clasificador entrenado: no hay dataset,
// es explicable, y el barbero puede discutir el resultado" (7.6). Por eso NO
// hay un modelo de ML acá: cada forma se puntúa como el promedio de un
// puñado de "membresías difusas" (0 a 1) sobre R1-R4, y el resultado se
// normaliza como fracción del total de las 7 (nunca una etiqueta única con
// seguridad falsa, secciones 3 y 12).
//
// Los umbrales concretos de cada membresía viven en `faceShapeThresholds.ts`
// (sección 17: "los umbrales de clasificación en un solo archivo de
// constantes, comentados con su justificación"), con la justificación de
// cada uno — son un criterio propio de arranque, no vienen fijados por la
// spec (a diferencia del gate de calidad de 7.3), así que hay que revisarlos
// contra fotos reales y criterio de barbero antes de confiar en ellos.

import type { FaceRatios, FaceShape, FaceShapeClassification, FaceShapeScore } from '../types'
import { FACE_SHAPES } from '../types'
import {
  HEART_FOREHEAD_TO_JAW_FULL,
  HEART_FOREHEAD_TO_JAW_START,
  R1_ALARGADA_FULL,
  R1_ALARGADA_START,
  R1_ANGULAR_BROAD_RANGE,
  R1_CUADRADA_RANGE,
  R1_OVALADA_RANGE,
  R1_REDONDA_RANGE,
  R2_CORAZON_FULL,
  R2_CORAZON_START,
  R2_DIAMANTE_END,
  R2_DIAMANTE_FULL,
  R2_MODERADA_RANGE,
  R2_TRIANGULAR_END,
  R2_TRIANGULAR_FULL,
  R3_CORAZON_END,
  R3_CORAZON_FULL,
  R3_CUADRADA_FULL,
  R3_CUADRADA_START,
  R3_DIAMANTE_END,
  R3_DIAMANTE_FULL,
  R3_OVALADA_RANGE,
  R3_REDONDA_RANGE,
  R3_TRIANGULAR_FULL,
  R3_TRIANGULAR_START,
  R4_CUADRADA_END,
  R4_CUADRADA_FULL,
  R4_REDONDA_FULL,
  R4_REDONDA_START,
  TRIANGULAR_JAW_TO_FOREHEAD_FULL,
  TRIANGULAR_JAW_TO_FOREHEAD_START,
} from './faceShapeThresholds'

/** Etiquetas en español rioplatense para mostrar en pantalla (sección 17: nada de inglés en UI). */
export const FACE_SHAPE_LABELS: Record<FaceShape, string> = {
  ovalada: 'Ovalada',
  redonda: 'Redonda',
  cuadrada: 'Cuadrada',
  alargada: 'Alargada',
  corazon: 'Corazón',
  diamante: 'Diamante',
  triangular: 'Triangular',
}

/**
 * Clasifica la forma de cara a partir de R1-R6 (solo se usan R1-R4: ver nota
 * en `faceShapeThresholds.ts` sobre por qué R5/R6 quedan afuera por ahora).
 * Devuelve las 7 formas puntuadas y normalizadas como fracción del total,
 * ordenadas de mayor a menor confianza.
 */
export function classifyFaceShape(ratios: FaceRatios): FaceShapeClassification {
  const rawScores: Record<FaceShape, number> = {
    alargada: scoreAlargada(ratios),
    redonda: scoreRedonda(ratios),
    cuadrada: scoreCuadrada(ratios),
    ovalada: scoreOvalada(ratios),
    corazon: scoreCorazon(ratios),
    diamante: scoreDiamante(ratios),
    triangular: scoreTriangular(ratios),
  }

  const total = FACE_SHAPES.reduce((sum, shape) => sum + rawScores[shape], 0)

  const scores: FaceShapeScore[] = FACE_SHAPES.map((shape) => ({
    shape,
    rawScore: rawScores[shape],
    // Si las 7 dieron 0 (caso degenerado, ratios muy fuera de cualquier
    // rango contemplado), repartir parejo en vez de dividir por 0.
    confidence: total > 0 ? rawScores[shape] / total : 1 / FACE_SHAPES.length,
  })).sort((a, b) => b.confidence - a.confidence)

  return { scores, top1: scores[0], top2: scores[1] }
}

// ---------------------------------------------------------------------------
// Puntaje por forma. Cada uno promedia las membresías difusas que traducen
// literalmente la guía de la sección 7.6 del prompt de esta fase (ver cada
// comentario para la cita exacta).
// ---------------------------------------------------------------------------

/** "Alargada/oblonga: R1 alto (cara mucho más larga que ancha)". */
function scoreAlargada(r: FaceRatios): number {
  return rampUp(r.r1, R1_ALARGADA_START, R1_ALARGADA_FULL)
}

/**
 * "Redonda: R1 cercano a 1 ..., R3 cercano a R2/ancho bicigomático (mandíbula
 * y frente parecidas en ancho a los pómulos), R4 con ángulo mandibular
 * suave/redondeado (obtuso)".
 */
function scoreRedonda(r: FaceRatios): number {
  const r1Close = trapezoid(r.r1, R1_REDONDA_RANGE)
  const foreheadClose = trapezoid(r.r2, R2_MODERADA_RANGE)
  const jawClose = trapezoid(r.r3, R3_REDONDA_RANGE)
  const softAngle = rampUp(r.r4, R4_REDONDA_START, R4_REDONDA_FULL)
  return average([r1Close, foreheadClose, jawClose, softAngle])
}

/**
 * "Cuadrada: R1 cercano a 1-1.2 ..., R3 alto (mandíbula casi tan ancha como
 * los pómulos), R4 con ángulo marcado (más cercano a 90°, mandíbula
 * angulosa)".
 */
function scoreCuadrada(r: FaceRatios): number {
  const r1Close = trapezoid(r.r1, R1_CUADRADA_RANGE)
  const wideJaw = rampUp(r.r3, R3_CUADRADA_START, R3_CUADRADA_FULL)
  const sharpAngle = rampDown(r.r4, R4_CUADRADA_FULL, R4_CUADRADA_END)
  return average([r1Close, wideJaw, sharpAngle])
}

/**
 * "Ovalada: R1 moderadamente alto ..., R3 algo menor que 1 (mandíbula un
 * poco más angosta que los pómulos), considerada la forma 'de referencia'/
 * equilibrada en visagismo".
 */
function scoreOvalada(r: FaceRatios): number {
  const r1Moderate = trapezoid(r.r1, R1_OVALADA_RANGE)
  const jawSlightlyNarrower = trapezoid(r.r3, R3_OVALADA_RANGE)
  return average([r1Moderate, jawSlightlyNarrower])
}

/** "Corazón: R2 alto respecto de R3 (frente notablemente más ancha que la mandíbula)". */
function scoreCorazon(r: FaceRatios): number {
  const r1Broad = trapezoid(r.r1, R1_ANGULAR_BROAD_RANGE)
  const wideForehead = rampUp(r.r2, R2_CORAZON_START, R2_CORAZON_FULL)
  const narrowJaw = rampDown(r.r3, R3_CORAZON_FULL, R3_CORAZON_END)
  const relational = rampUp(safeRatio(r.r2, r.r3), HEART_FOREHEAD_TO_JAW_START, HEART_FOREHEAD_TO_JAW_FULL)
  return average([r1Broad, wideForehead, narrowJaw, relational])
}

/** "Diamante: pómulos claramente el punto más ancho de la cara, tanto R2 como R3 bajos en relación a eso". */
function scoreDiamante(r: FaceRatios): number {
  const r1Broad = trapezoid(r.r1, R1_ANGULAR_BROAD_RANGE)
  const narrowForehead = rampDown(r.r2, R2_DIAMANTE_FULL, R2_DIAMANTE_END)
  const narrowJaw = rampDown(r.r3, R3_DIAMANTE_FULL, R3_DIAMANTE_END)
  return average([r1Broad, narrowForehead, narrowJaw])
}

/** "Triangular: R3 alto respecto de R2 (mandíbula más ancha que la frente, al revés de corazón)". */
function scoreTriangular(r: FaceRatios): number {
  const r1Broad = trapezoid(r.r1, R1_ANGULAR_BROAD_RANGE)
  const wideJaw = rampUp(r.r3, R3_TRIANGULAR_START, R3_TRIANGULAR_FULL)
  const narrowForehead = rampDown(r.r2, R2_TRIANGULAR_FULL, R2_TRIANGULAR_END)
  const relational = rampUp(
    safeRatio(r.r3, r.r2),
    TRIANGULAR_JAW_TO_FOREHEAD_START,
    TRIANGULAR_JAW_TO_FOREHEAD_FULL,
  )
  return average([r1Broad, wideJaw, narrowForehead, relational])
}

/**
 * Aplica la corrección manual del barbero (7.6: "un selector para pisar el
 * resultado... registrar cada corrección") sobre la clasificación completa,
 * para que el motor de recomendación (Fase 4, `engine/recommend.ts`) siempre
 * trabaje sobre lo que el barbero CONFIRMÓ, no sobre lo que sugirió el
 * algoritmo (Fase 5: wiring de form → motor → resultados).
 *
 * Si `corrected` ya es el top1 original, no hay nada que tocar. Si no,
 * `corrected` pasa a ser el nuevo top1 con confianza plena — el barbero está
 * seguro, no tiene sentido repartirle una confianza fraccionaria como la que
 * calcula el algoritmo — y el top2 queda así: si `corrected` era el top2
 * original, el antiguo top1 baja a top2 (se conserva la otra opción real que
 * el algoritmo había detectado); si `corrected` no era ninguna de las dos
 * top, el top2 original se mantiene sin cambios.
 */
export function applyFaceShapeOverride(
  classification: FaceShapeClassification,
  corrected: FaceShape,
): FaceShapeClassification {
  const { top1, top2 } = classification
  if (corrected === top1.shape) return classification

  const newTop1: FaceShapeScore = { shape: corrected, rawScore: 1, confidence: 1 }
  const newTop2 = corrected === top2.shape ? top1 : top2
  const rest = classification.scores.filter((s) => s.shape !== newTop1.shape && s.shape !== newTop2.shape)

  return { scores: [newTop1, newTop2, ...rest], top1: newTop1, top2: newTop2 }
}

// ---------------------------------------------------------------------------
// Frase explicativa (7.6: "Alargada 61% / Ovalada 34% — cara 1.62× más larga
// que ancha, mandíbula casi del mismo ancho que los pómulos."). Se cita el
// ratio que más pesa en la forma top-1 y, si aporta información distinta, el
// que más pesa en la top-2 — el mismo patrón del ejemplo de la spec (ahí la
// primera cláusula es el R1 de "alargada" y la segunda es el R3 de
// "ovalada").
// ---------------------------------------------------------------------------

/** Arma la frase explicativa en español rioplatense a mostrar bajo el top-2. */
export function explainFaceShape(classification: FaceShapeClassification, ratios: FaceRatios): string {
  const { top1, top2 } = classification
  const pct1 = Math.round(top1.confidence * 100)
  const pct2 = Math.round(top2.confidence * 100)

  const clause1 = describeShapeRatio(top1.shape, ratios)
  const clause2 = describeShapeRatio(top2.shape, ratios)
  const clause = clause1 === clause2 ? clause1 : `${clause1}, ${clause2}`

  return `${FACE_SHAPE_LABELS[top1.shape]} ${pct1}% / ${FACE_SHAPE_LABELS[top2.shape]} ${pct2}% — ${clause}.`
}

/**
 * Cláusula corta citando el/los ratio(s) que definen a `shape`, sin
 * mayúscula inicial ni punto final. Exportada (no solo de uso interno de
 * `explainFaceShape`) porque `engine/explain.ts` (Fase 4) la reutiliza para
 * citar el mismo ratio concreto al explicar por qué un CORTE puntuó alto por
 * la forma de cara — mismo estilo de redacción, una sola fuente de verdad
 * para "qué ratio explica esta forma".
 */
export function describeShapeRatio(shape: FaceShape, r: FaceRatios): string {
  switch (shape) {
    case 'alargada':
      return `cara ${r.r1.toFixed(2)}× más larga que ancha`
    case 'redonda':
      return `cara apenas más larga que ancha (${r.r1.toFixed(2)}×), frente y mandíbula casi del ancho de los pómulos`
    case 'cuadrada':
      return `mandíbula casi tan ancha como los pómulos (${pct(r.r3)}) y con ángulo marcado`
    case 'ovalada':
      return `mandíbula casi del mismo ancho que los pómulos (${pct(r.r3)})`
    case 'corazon':
      return `frente bastante más ancha que la mandíbula (frente ${pct(r.r2)} vs. mandíbula ${pct(r.r3)} del ancho de los pómulos)`
    case 'diamante':
      return `pómulos claramente el punto más ancho (frente ${pct(r.r2)} y mandíbula ${pct(r.r3)} de ese ancho)`
    case 'triangular':
      return `mandíbula más ancha que la frente (mandíbula ${pct(r.r3)} vs. frente ${pct(r.r2)} del ancho de los pómulos)`
  }
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

// ---------------------------------------------------------------------------
// Funciones de pertenencia difusa genéricas.
// ---------------------------------------------------------------------------

/** Promedio simple, ignorando `NaN` no está contemplado a propósito: si algo da `NaN` acá es un bug, no un caso a tolerar. */
function average(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * División para las membresías relacionales (R2/R3 y R3/R2). Si el
 * denominador es 0 (caso degenerado: mandíbula o frente con ancho medido en
 * 0, landmarks superpuestos) no hay señal relacional que sacar — se
 * devuelve 0 en vez de `NaN`/`Infinity`, así el resto de las membresías de
 * esa forma siguen decidiendo.
 */
function safeRatio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}

/**
 * Rampa ascendente: 0 en o antes de `start`, 1 en o después de `full`,
 * interpolación lineal en el medio. Para membresías "sin techo" (cuanto más
 * alto el valor, más pertenece a la forma, sin límite superior).
 */
function rampUp(value: number, start: number, full: number): number {
  if (value <= start) return 0
  if (value >= full) return 1
  return (value - start) / (full - start)
}

/**
 * Rampa descendente: 1 en o antes de `full`, 0 en o después de `end`,
 * interpolación lineal en el medio. Para membresías "sin piso" (cuanto más
 * bajo el valor, más pertenece a la forma).
 */
function rampDown(value: number, full: number, end: number): number {
  if (value <= full) return 1
  if (value >= end) return 0
  return (end - value) / (end - full)
}

/**
 * Trapecio completo a partir de `[a, b, c, d]`: sube de 0 a 1 entre `a` y
 * `b`, meseta en 1 entre `b` y `c`, baja de 1 a 0 entre `c` y `d`. Es la
 * combinación de `rampUp` y `rampDown` para membresías con un rango
 * "ideal" acotado por ambos lados.
 */
function trapezoid(value: number, [a, b, c, d]: readonly [number, number, number, number]): number {
  return Math.min(rampUp(value, a, b), rampDown(value, c, d))
}
