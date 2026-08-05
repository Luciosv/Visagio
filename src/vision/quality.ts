// Gate de calidad (sección 7.3 de CLAUDE.md). Funciones puras: entran
// números (matriz de transformación, landmarks, píxeles en escala de grises),
// salen números o un veredicto. Nada de DOM ni de `canvas` acá adentro (ver
// convención de src/vision/ en la sección 17) — quien llame a estas
// funciones se encarga de extraer los datos del canvas/imagen primero.

import type {
  FacialTransformationMatrix,
  LandmarkPoint,
  NormalizedBoundingBox,
  PoseAngles,
  QualityInput,
  QualityResult,
} from '../types'
import {
  MAX_PITCH_DEG,
  MAX_YAW_DEG,
  MIN_FACE_HEIGHT_FRACTION,
  MIN_SHARPNESS_VARIANCE,
  ROLL_CORRECTION_THRESHOLD_DEG,
} from './qualityThresholds'

/**
 * Descompone la matriz de transformación facial de MediaPipe en yaw/pitch/roll
 * (grados).
 *
 * Supuestos, a validar contra caras reales (ver reporte de la Fase 1):
 * - `data` viene **column-major** (16 valores, 4x4), confirmado en la
 *   documentación de MediaPipe: la matriz está pensada para usarse directo
 *   como matriz de modelo en WebGL.
 * - El sistema de coordenadas de la cara es right-handed con X a la derecha,
 *   Y hacia arriba, Z saliendo de la cara hacia la cámara.
 * - Orden de rotación Y·X·Z (yaw · pitch · roll) para extraer los ángulos de
 *   Euler, la convención más común para pose de cabeza en este tipo de
 *   sistema. La MAGNITUD de cada ángulo no depende de esta elección de signo,
 *   así que los rechazos por `|yaw| > umbral` / `|pitch| > umbral` son
 *   confiables incluso si el signo estuviera invertido. El SIGNO sí importa
 *   para saber hacia qué lado rotar al corregir el roll — está pendiente
 *   confirmarlo con una foto real inclinada a mano (ver reporte).
 */
export function decomposePose(matrix: FacialTransformationMatrix): PoseAngles {
  const m = matrix.data
  // R[row][col] = data[col*4 + row] (column-major).
  const r02 = m[8]
  const r12 = m[9]
  const r22 = m[10]
  const r10 = m[1]
  const r11 = m[5]

  const pitchRad = Math.asin(clamp(-r12, -1, 1))
  const yawRad = Math.atan2(r02, r22)
  const rollRad = Math.atan2(r10, r11)

  return {
    yawDeg: toDegrees(yawRad),
    pitchDeg: toDegrees(pitchRad),
    rollDeg: toDegrees(rollRad),
  }
}

/** Verdadero si el roll amerita rotar la imagen antes de seguir (7.3: el roll no rechaza, corrige). */
export function needsRollCorrection(rollDeg: number): boolean {
  return Math.abs(rollDeg) > ROLL_CORRECTION_THRESHOLD_DEG
}

/** Bounding box normalizado [0,1] de un set de landmarks. */
export function computeBoundingBox(landmarks: readonly LandmarkPoint[]): NormalizedBoundingBox {
  if (landmarks.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const { x, y } of landmarks) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

/**
 * Fracción [0,1] del alto de la imagen que ocupa el bounding box. Como los
 * landmarks vienen normalizados por alto de imagen en `y`, es directamente
 * `maxY - minY`.
 */
export function boundingBoxHeightFraction(bbox: NormalizedBoundingBox): number {
  return bbox.maxY - bbox.minY
}

/**
 * Varianza del laplaciano sobre una imagen en escala de grises (medida de
 * nitidez: cuanto más borrosa la imagen, menor la varianza de la respuesta al
 * laplaciano). `gray` es un buffer plano de tamaño `width * height`, un valor
 * de intensidad por píxel.
 *
 * Ver `qualityThresholds.ts` para la justificación del umbral que se compara
 * contra este resultado.
 */
export function laplacianVariance(
  gray: ArrayLike<number>,
  width: number,
  height: number,
): number {
  if (width < 3 || height < 3) return 0

  const count = (width - 2) * (height - 2)
  if (count <= 0) return 0

  let sum = 0
  let sumSquares = 0

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width
    for (let x = 1; x < width - 1; x++) {
      const idx = rowOffset + x
      const laplacian =
        gray[idx - width] + gray[idx + width] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx]
      sum += laplacian
      sumSquares += laplacian * laplacian
    }
  }

  const mean = sum / count
  return sumSquares / count - mean * mean
}

/**
 * Evalúa el gate de calidad completo. No conoce el roll: la corrección de
 * roll (rotar y volver a detectar) es responsabilidad de quien orqueste el
 * pipeline (7.3: el roll nunca rechaza), usando `needsRollCorrection` antes
 * de llegar acá. Para cuando se llama a `evaluateQuality`, se asume que la
 * imagen ya está nivelada.
 */
export function evaluateQuality(input: QualityInput): QualityResult {
  if (input.faceCount === 0) {
    return {
      ok: false,
      code: 'sin_cara',
      message: 'No se detectó ninguna cara. Probá con más luz y mirando de frente a la cámara.',
    }
  }

  if (input.faceCount > 1) {
    return {
      ok: false,
      code: 'multiples_caras',
      message: 'Se detectó más de una cara en la foto. Sacá una foto donde salga una sola persona.',
    }
  }

  if (Math.abs(input.yawDeg) > MAX_YAW_DEG) {
    return {
      ok: false,
      code: 'pose_yaw',
      message: 'Giraste la cabeza, mirá derecho a la cámara.',
    }
  }

  if (Math.abs(input.pitchDeg) > MAX_PITCH_DEG) {
    return {
      ok: false,
      code: 'pose_pitch',
      message: 'Bajaste o subiste la mirada, mirá derecho a la cámara.',
    }
  }

  if (input.boundingBoxHeightFraction < MIN_FACE_HEIGHT_FRACTION) {
    return {
      ok: false,
      code: 'tamano',
      message: 'Acercate un poco más a la cámara.',
    }
  }

  if (input.sharpness < MIN_SHARPNESS_VARIANCE) {
    return {
      ok: false,
      code: 'nitidez',
      message: 'La foto salió borrosa. Probá con más luz o mantené quieta la cámara.',
    }
  }

  return { ok: true }
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
