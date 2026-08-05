// Métricas R1-R6 (sección 7.5 de CLAUDE.md). Función pura y testeable (17):
// entran landmarks + el punto de nacimiento (sugerido o corregido, decide
// quien llama, ver App.tsx) + el tamaño de la imagen, salen números. Nada de
// DOM acá adentro.
//
// OJO CON EL ASPECT RATIO: los landmarks vienen normalizados [0,1] por
// separado en x (fracción del ANCHO) e y (fracción del ALTO), igual que los
// consume `overlay.ts`. Una foto de celular casi nunca es cuadrada, así que
// mezclar un delta de x normalizado con uno de y normalizado sin corregir por
// el aspect ratio da una razón incorrecta (una foto en 3:4, por ejemplo,
// alargaría o achataría todas las medidas verticales respecto de las
// horizontales). Por eso esta función pide `imageWidth`/`imageHeight` y
// convierte cada punto a píxeles antes de medir cualquier distancia
// euclidiana. Asume que la imagen tiene píxeles cuadrados (cierto para fotos
// de celular estándar, no hay corrección extra para eso).

import type { FaceRatios, FacialThirds, LandmarkPoint, Point2D } from '../types'
import {
  LANDMARK_BIZYGOMATIC_LEFT,
  LANDMARK_BIZYGOMATIC_RIGHT,
  LANDMARK_CHIN,
  LANDMARK_EYEBROW_LEFT,
  LANDMARK_EYEBROW_RIGHT,
  LANDMARK_FOREHEAD_WIDTH_LEFT,
  LANDMARK_FOREHEAD_WIDTH_RIGHT,
  LANDMARK_GONION_LEFT,
  LANDMARK_GONION_RIGHT,
  LANDMARK_NOSE_BASE,
} from './landmarkIndices'

export interface ComputeFaceRatiosInput {
  readonly landmarks: readonly LandmarkPoint[]
  /**
   * Punto de nacimiento del pelo a usar para medir: el sugerido (landmark 10)
   * o el corregido a mano por el barbero (7.4). Esta función no decide cuál:
   * solo mide con el que le pasen. Normalizado [0,1] igual que los landmarks.
   */
  readonly hairlinePoint: Point2D
  readonly imageWidth: number
  readonly imageHeight: number
}

/**
 * Calcula R1-R6 a partir de los landmarks del face mesh y el punto de
 * nacimiento del pelo. Tira error si falta algún landmark necesario (índice
 * fuera de rango): eso normalmente significa que no se detectó una cara
 * completa, y quien orquesta el pipeline no debería haber llegado hasta acá.
 */
export function computeFaceRatios(input: ComputeFaceRatiosInput): FaceRatios {
  const { landmarks, hairlinePoint, imageWidth, imageHeight } = input

  const toPixels = (point: Point2D): Point2D => ({
    x: point.x * imageWidth,
    y: point.y * imageHeight,
  })
  const pixelLandmark = (index: number): Point2D => toPixels(requireLandmark(landmarks, index))

  const hairline = toPixels(hairlinePoint)
  const chin = pixelLandmark(LANDMARK_CHIN)
  const bizygomaticLeft = pixelLandmark(LANDMARK_BIZYGOMATIC_LEFT)
  const bizygomaticRight = pixelLandmark(LANDMARK_BIZYGOMATIC_RIGHT)
  const gonionLeft = pixelLandmark(LANDMARK_GONION_LEFT)
  const gonionRight = pixelLandmark(LANDMARK_GONION_RIGHT)
  const foreheadLeft = pixelLandmark(LANDMARK_FOREHEAD_WIDTH_LEFT)
  const foreheadRight = pixelLandmark(LANDMARK_FOREHEAD_WIDTH_RIGHT)
  const eyebrowLeft = pixelLandmark(LANDMARK_EYEBROW_LEFT)
  const eyebrowRight = pixelLandmark(LANDMARK_EYEBROW_RIGHT)
  const noseBase = pixelLandmark(LANDMARK_NOSE_BASE)

  const eyebrowMid = midpoint(eyebrowLeft, eyebrowRight)

  const bizygomaticWidth = distance(bizygomaticLeft, bizygomaticRight)
  const faceLength = distance(hairline, chin)
  const foreheadWidth = distance(foreheadLeft, foreheadRight)
  const jawWidth = distance(gonionLeft, gonionRight)
  const foreheadHeight = distance(hairline, eyebrowMid)

  return {
    r1: faceLength / bizygomaticWidth,
    r2: foreheadWidth / bizygomaticWidth,
    r3: jawWidth / bizygomaticWidth,
    r4: mandibularAngleDeg(gonionLeft, gonionRight, chin, bizygomaticLeft, bizygomaticRight),
    r5: foreheadHeight / faceLength,
    r6: facialThirds(hairline, eyebrowMid, noseBase, chin),
  }
}

/**
 * Ángulo mandibular (R4) en el gonion. La sección 7.5 dice "ángulo mandibular
 * en el gonion" pero no especifica con qué dos rayos formarlo: el mesh no
 * tiene un landmark en el cóndilo/oreja para trazar la rama ascendente real
 * de la mandíbula. SUPUESTO de la Fase 2: se aproxima esa rama con el
 * segmento gonion→bicigomático (mismo lado), ya que el pómulo está por
 * encima y hacia atrás del gonion, en una dirección razonablemente cercana a
 * la de la rama. El otro rayo es el segmento gonion→mentón (cuerpo de la
 * mandíbula), que sí es directo. Se promedian ambos lados para no depender de
 * la asimetría de una sola foto. VALIDAR con caras reales: si el número no
 * tiene sentido comparado con lo que se ve a ojo, este es el primer supuesto
 * a revisar.
 */
function mandibularAngleDeg(
  gonionLeft: Point2D,
  gonionRight: Point2D,
  chin: Point2D,
  bizygomaticLeft: Point2D,
  bizygomaticRight: Point2D,
): number {
  const leftAngle = angleBetweenDeg(gonionLeft, chin, bizygomaticLeft)
  const rightAngle = angleBetweenDeg(gonionRight, chin, bizygomaticRight)
  return (leftAngle + rightAngle) / 2
}

/** Ángulo en grados, en `vertex`, entre los rayos hacia `a` y hacia `b`. */
function angleBetweenDeg(vertex: Point2D, a: Point2D, b: Point2D): number {
  const v1 = { x: a.x - vertex.x, y: a.y - vertex.y }
  const v2 = { x: b.x - vertex.x, y: b.y - vertex.y }
  const mag1 = Math.hypot(v1.x, v1.y)
  const mag2 = Math.hypot(v2.x, v2.y)
  if (mag1 === 0 || mag2 === 0) return 0
  const cos = clamp((v1.x * v2.x + v1.y * v2.y) / (mag1 * mag2), -1, 1)
  return (Math.acos(cos) * 180) / Math.PI
}

/**
 * R6: tercios faciales clásicos, como fracción de cada segmento respecto del
 * largo total nacimiento→mentón (medido como la suma de los tres tramos, no
 * como la distancia directa nacimiento→mentón, para que los tres términos
 * sumen exactamente 1 aunque los puntos no caigan perfectamente en línea).
 */
function facialThirds(
  hairline: Point2D,
  eyebrowMid: Point2D,
  noseBase: Point2D,
  chin: Point2D,
): FacialThirds {
  const frenteLen = distance(hairline, eyebrowMid)
  const narizLen = distance(eyebrowMid, noseBase)
  const mentonLen = distance(noseBase, chin)
  const total = frenteLen + narizLen + mentonLen

  if (total === 0) {
    return { frente: 0, nariz: 0, menton: 0 }
  }

  return {
    frente: frenteLen / total,
    nariz: narizLen / total,
    menton: mentonLen / total,
  }
}

function requireLandmark(landmarks: readonly LandmarkPoint[], index: number): LandmarkPoint {
  const point = landmarks[index]
  if (!point) {
    throw new Error(`Falta el landmark ${index} para calcular las métricas.`)
  }
  return point
}

function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
