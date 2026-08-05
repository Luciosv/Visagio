import { describe, expect, it } from 'vitest'
import type { LandmarkPoint } from '../types'
import sampleDetection from './__fixtures__/sampleDetection.json'
import {
  MAX_PITCH_DEG,
  MAX_YAW_DEG,
  MIN_FACE_HEIGHT_FRACTION,
  MIN_SHARPNESS_VARIANCE,
} from './qualityThresholds'
import {
  boundingBoxHeightFraction,
  computeBoundingBox,
  decomposePose,
  evaluateQuality,
  laplacianVariance,
  needsRollCorrection,
} from './quality'

// El fixture es una detección REAL: se generó corriendo el pipeline (Playwright
// + FaceLandmarker) sobre business-person.png, la foto de stock que usa el
// propio codelab oficial de MediaPipe para sus demos de FaceLandmarker. No es
// la foto de un cliente ni de una persona identificable en el repo, solo el
// JSON de landmarks + matriz que salió de esa detección.

describe('decomposePose', () => {
  it('devuelve ~0 en los tres ejes para la matriz identidad', () => {
    const identity = { rows: 4, columns: 4, data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }
    const pose = decomposePose(identity)
    expect(pose.yawDeg).toBeCloseTo(0, 5)
    expect(pose.pitchDeg).toBeCloseTo(0, 5)
    expect(pose.rollDeg).toBeCloseTo(0, 5)
  })

  it('aísla un roll puro de 30°, sin afectar yaw ni pitch', () => {
    const angle = (30 * Math.PI) / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    // Rz(30°), column-major: col0=[cos,sin,0,0] col1=[-sin,cos,0,0] col2=[0,0,1,0] col3=[0,0,0,1]
    const data = [cos, sin, 0, 0, -sin, cos, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    const pose = decomposePose({ rows: 4, columns: 4, data })
    expect(pose.rollDeg).toBeCloseTo(30, 3)
    expect(pose.yawDeg).toBeCloseTo(0, 3)
    expect(pose.pitchDeg).toBeCloseTo(0, 3)
  })

  it('aísla un yaw puro de 20°, sin afectar pitch ni roll', () => {
    const angle = (20 * Math.PI) / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    // Ry(20°), column-major: col0=[cos,0,-sin,0] col1=[0,1,0,0] col2=[sin,0,cos,0] col3=[0,0,0,1]
    const data = [cos, 0, -sin, 0, 0, 1, 0, 0, sin, 0, cos, 0, 0, 0, 0, 1]
    const pose = decomposePose({ rows: 4, columns: 4, data })
    expect(pose.yawDeg).toBeCloseTo(20, 3)
    expect(pose.pitchDeg).toBeCloseTo(0, 3)
    expect(pose.rollDeg).toBeCloseTo(0, 3)
  })

  it('extrae ángulos finitos y en rango de una matriz de detección real (fixture)', () => {
    const pose = decomposePose(sampleDetection.matrix)
    expect(Number.isFinite(pose.yawDeg)).toBe(true)
    expect(Number.isFinite(pose.pitchDeg)).toBe(true)
    expect(Number.isFinite(pose.rollDeg)).toBe(true)
    expect(Math.abs(pose.yawDeg)).toBeLessThan(90)
    expect(Math.abs(pose.pitchDeg)).toBeLessThan(90)
    expect(Math.abs(pose.rollDeg)).toBeLessThan(90)
  })
})

describe('needsRollCorrection', () => {
  it('no corrige por debajo del umbral', () => {
    expect(needsRollCorrection(9.9)).toBe(false)
  })

  it('corrige por encima del umbral', () => {
    expect(needsRollCorrection(10.1)).toBe(true)
  })
})

describe('computeBoundingBox / boundingBoxHeightFraction', () => {
  it('calcula el bbox de landmarks sintéticos', () => {
    const landmarks: LandmarkPoint[] = [
      { x: 0.2, y: 0.1, z: 0 },
      { x: 0.8, y: 0.1, z: 0 },
      { x: 0.5, y: 0.6, z: 0 },
    ]
    const bbox = computeBoundingBox(landmarks)
    expect(bbox).toEqual({ minX: 0.2, minY: 0.1, maxX: 0.8, maxY: 0.6 })
    expect(boundingBoxHeightFraction(bbox)).toBeCloseTo(0.5, 10)
  })

  it('funciona con los 478 landmarks reales del fixture', () => {
    const bbox = computeBoundingBox(sampleDetection.landmarks)
    expect(bbox.maxX).toBeGreaterThan(bbox.minX)
    expect(bbox.maxY).toBeGreaterThan(bbox.minY)
    const fraction = boundingBoxHeightFraction(bbox)
    expect(fraction).toBeGreaterThan(0)
    expect(fraction).toBeLessThanOrEqual(1)
  })
})

describe('laplacianVariance', () => {
  it('da 0 en una imagen totalmente plana (sin bordes)', () => {
    const flat = new Float64Array(10 * 10).fill(128)
    expect(laplacianVariance(flat, 10, 10)).toBeCloseTo(0, 10)
  })

  it('da un valor alto en un patrón de tablero de ajedrez (muchos bordes)', () => {
    const width = 10
    const height = 10
    const checker = new Float64Array(width * height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        checker[y * width + x] = (x + y) % 2 === 0 ? 0 : 255
      }
    }
    expect(laplacianVariance(checker, width, height)).toBeGreaterThan(MIN_SHARPNESS_VARIANCE)
  })
})

describe('evaluateQuality', () => {
  const basePassingInput = {
    faceCount: 1,
    yawDeg: 0,
    pitchDeg: 0,
    boundingBoxHeightFraction: 0.4,
    sharpness: MIN_SHARPNESS_VARIANCE + 50,
  }

  it('acepta cuando todo está dentro de los umbrales', () => {
    expect(evaluateQuality(basePassingInput)).toEqual({ ok: true })
  })

  it('rechaza sin cara detectada', () => {
    const result = evaluateQuality({ ...basePassingInput, faceCount: 0 })
    expect(result).toMatchObject({ ok: false, code: 'sin_cara' })
  })

  it('rechaza con más de una cara', () => {
    const result = evaluateQuality({ ...basePassingInput, faceCount: 2 })
    expect(result).toMatchObject({ ok: false, code: 'multiples_caras' })
  })

  it('rechaza por yaw excedido', () => {
    const result = evaluateQuality({ ...basePassingInput, yawDeg: MAX_YAW_DEG + 0.1 })
    expect(result).toMatchObject({ ok: false, code: 'pose_yaw' })
  })

  it('acepta justo en el borde del umbral de yaw', () => {
    const result = evaluateQuality({ ...basePassingInput, yawDeg: MAX_YAW_DEG })
    expect(result.ok).toBe(true)
  })

  it('rechaza por pitch excedido', () => {
    const result = evaluateQuality({ ...basePassingInput, pitchDeg: -(MAX_PITCH_DEG + 0.1) })
    expect(result).toMatchObject({ ok: false, code: 'pose_pitch' })
  })

  it('rechaza por tamaño de cara chico', () => {
    const result = evaluateQuality({
      ...basePassingInput,
      boundingBoxHeightFraction: MIN_FACE_HEIGHT_FRACTION - 0.01,
    })
    expect(result).toMatchObject({ ok: false, code: 'tamano' })
  })

  it('rechaza por nitidez baja', () => {
    const result = evaluateQuality({ ...basePassingInput, sharpness: MIN_SHARPNESS_VARIANCE - 1 })
    expect(result).toMatchObject({ ok: false, code: 'nitidez' })
  })

  it('sobre la foto de stock real del fixture, hoy rechaza por pitch', () => {
    // Regresión intencional, no un resultado "deseado": esta foto (la que usa
    // el propio codelab oficial de MediaPipe) da un pitch de ~17-18°, por
    // encima del umbral de 10°, aun cuando a ojo la persona mira derecho a la
    // cámara. Puede ser una toma de estudio con la cámara en un ángulo
    // levemente picado, o un sesgo del eje de pitch en la malla canónica de
    // MediaPipe. Documentado en el reporte de la Fase 1: hay que validar el
    // umbral de pitch con fotos reales de barbería (celular a la altura de
    // los ojos) antes de confiar en este gate en producción.
    const pose = decomposePose(sampleDetection.matrix)
    const bbox = computeBoundingBox(sampleDetection.landmarks)
    const result = evaluateQuality({
      faceCount: sampleDetection.faceCount,
      yawDeg: pose.yawDeg,
      pitchDeg: pose.pitchDeg,
      boundingBoxHeightFraction: boundingBoxHeightFraction(bbox),
      sharpness: MIN_SHARPNESS_VARIANCE + 50,
    })
    expect(result).toMatchObject({ ok: false, code: 'pose_pitch' })
  })
})
