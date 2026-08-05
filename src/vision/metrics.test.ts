import { describe, expect, it } from 'vitest'
import type { LandmarkPoint } from '../types'
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
  TOTAL_FACE_LANDMARKS,
} from './landmarkIndices'
import { computeFaceRatios } from './metrics'

/** Arma un array de 478 landmarks "vacíos" (0,0,0) y pisa los índices dados. */
function buildLandmarks(overrides: Record<number, { x: number; y: number }>): LandmarkPoint[] {
  const landmarks: LandmarkPoint[] = Array.from({ length: TOTAL_FACE_LANDMARKS }, () => ({
    x: 0,
    y: 0,
    z: 0,
  }))
  for (const [indexStr, point] of Object.entries(overrides)) {
    landmarks[Number(indexStr)] = { x: point.x, y: point.y, z: 0 }
  }
  return landmarks
}

describe('computeFaceRatios', () => {
  // Escenario a mano, imagen cuadrada (100x100) para que 1 unidad normalizada
  // = 1 unidad normalizada en ambos ejes sin distorsión de aspect ratio.
  // Geometría elegida para que cada Rx se pueda verificar a mano:
  //
  //           hairline (0.5, 0.0)
  //  forehead L (0.35,0.2)   forehead R (0.65,0.2)   -> ancho frente = 0.30
  //   eyebrow L (0.40,0.3)   eyebrow R (0.60,0.3)    -> punto medio (0.5,0.3)
  // bizygomatic L (0.3,0.5)  bizygomatic R (0.7,0.5) -> ancho bicigomático = 0.40
  //           nose base (0.5, 0.6)
  //   gonion L (0.32,0.8)    gonion R (0.68,0.8)     -> ancho mandibular = 0.36
  //           chin (0.5, 1.0)
  const landmarks = buildLandmarks({
    [LANDMARK_CHIN]: { x: 0.5, y: 1.0 },
    [LANDMARK_BIZYGOMATIC_LEFT]: { x: 0.3, y: 0.5 },
    [LANDMARK_BIZYGOMATIC_RIGHT]: { x: 0.7, y: 0.5 },
    [LANDMARK_GONION_LEFT]: { x: 0.32, y: 0.8 },
    [LANDMARK_GONION_RIGHT]: { x: 0.68, y: 0.8 },
    [LANDMARK_FOREHEAD_WIDTH_LEFT]: { x: 0.35, y: 0.2 },
    [LANDMARK_FOREHEAD_WIDTH_RIGHT]: { x: 0.65, y: 0.2 },
    [LANDMARK_EYEBROW_LEFT]: { x: 0.4, y: 0.3 },
    [LANDMARK_EYEBROW_RIGHT]: { x: 0.6, y: 0.3 },
    [LANDMARK_NOSE_BASE]: { x: 0.5, y: 0.6 },
  })
  const hairlinePoint = { x: 0.5, y: 0.0 }

  it('calcula R1 (largo/ancho bicigomático) = 100/40 = 2.5', () => {
    const ratios = computeFaceRatios({ landmarks, hairlinePoint, imageWidth: 100, imageHeight: 100 })
    expect(ratios.r1).toBeCloseTo(2.5, 10)
  })

  it('calcula R2 (ancho de frente/ancho bicigomático) = 30/40 = 0.75', () => {
    const ratios = computeFaceRatios({ landmarks, hairlinePoint, imageWidth: 100, imageHeight: 100 })
    expect(ratios.r2).toBeCloseTo(0.75, 10)
  })

  it('calcula R3 (ancho mandibular/ancho bicigomático) = 36/40 = 0.9', () => {
    const ratios = computeFaceRatios({ landmarks, hairlinePoint, imageWidth: 100, imageHeight: 100 })
    expect(ratios.r3).toBeCloseTo(0.9, 10)
  })

  it('calcula R5 (altura de frente/largo de cara) = 30/100 = 0.3', () => {
    const ratios = computeFaceRatios({ landmarks, hairlinePoint, imageWidth: 100, imageHeight: 100 })
    expect(ratios.r5).toBeCloseTo(0.3, 10)
  })

  it('calcula R6 (tercios faciales) = 30/30/40 -> 0.3/0.3/0.4', () => {
    const ratios = computeFaceRatios({ landmarks, hairlinePoint, imageWidth: 100, imageHeight: 100 })
    expect(ratios.r6.frente).toBeCloseTo(0.3, 10)
    expect(ratios.r6.nariz).toBeCloseTo(0.3, 10)
    expect(ratios.r6.menton).toBeCloseTo(0.4, 10)
    expect(ratios.r6.frente + ratios.r6.nariz + ratios.r6.menton).toBeCloseTo(1, 10)
  })

  it('R4 (ángulo mandibular) da un ángulo finito y en rango [0, 180]', () => {
    const ratios = computeFaceRatios({ landmarks, hairlinePoint, imageWidth: 100, imageHeight: 100 })
    expect(Number.isFinite(ratios.r4)).toBe(true)
    expect(ratios.r4).toBeGreaterThan(0)
    expect(ratios.r4).toBeLessThan(180)
  })

  it('R4 da exactamente 90° cuando la rama y el cuerpo de la mandíbula son perpendiculares', () => {
    // Geometría dedicada, simple de verificar a mano: en cada gonion, el
    // vector hacia el mentón y el vector hacia el bicigomático forman un
    // ángulo recto exacto. imageWidth=imageHeight=1 para que "normalizado" y
    // "píxel" coincidan.
    const rightAngleLandmarks = buildLandmarks({
      [LANDMARK_CHIN]: { x: 1, y: 0 },
      [LANDMARK_GONION_LEFT]: { x: 0, y: 0 },
      [LANDMARK_BIZYGOMATIC_LEFT]: { x: 0, y: 1 }, // vector gonionL->chin=(1,0), gonionL->bizigL=(0,1)
      [LANDMARK_GONION_RIGHT]: { x: 10, y: 0 },
      [LANDMARK_BIZYGOMATIC_RIGHT]: { x: 10, y: 1 }, // vector gonionR->chin=(-9,0), gonionR->bizigR=(0,1)
      // El resto de los puntos no importan para este caso, pero tienen que
      // existir para que la función no tire error por landmark faltante.
      [LANDMARK_FOREHEAD_WIDTH_LEFT]: { x: 0, y: 0.1 },
      [LANDMARK_FOREHEAD_WIDTH_RIGHT]: { x: 10, y: 0.1 },
      [LANDMARK_EYEBROW_LEFT]: { x: 4, y: 0.2 },
      [LANDMARK_EYEBROW_RIGHT]: { x: 6, y: 0.2 },
      [LANDMARK_NOSE_BASE]: { x: 5, y: 0.3 },
    })
    const ratios = computeFaceRatios({
      landmarks: rightAngleLandmarks,
      hairlinePoint: { x: 5, y: -1 },
      imageWidth: 1,
      imageHeight: 1,
    })
    expect(ratios.r4).toBeCloseTo(90, 10)
  })

  it('corrige el aspect ratio: una foto no cuadrada no debe distorsionar las razones', () => {
    // Mismos puntos normalizados que el escenario principal, pero en una
    // imagen de 200x100 (2:1). Si la función NO corrigiera por aspect ratio
    // (es decir, si mezclara deltas de x e y normalizados tal cual, sin pasar
    // a píxeles), R1 daría 1.0/0.4 = 2.5, igual que en el caso cuadrado. Con
    // la corrección de aspect ratio, el ancho bicigomático (horizontal) se
    // duplica en píxeles respecto de la altura de cara (vertical), así que
    // R1 tiene que dar la mitad: 2.5 / 2 = 1.25.
    const ratios = computeFaceRatios({
      landmarks,
      hairlinePoint,
      imageWidth: 200,
      imageHeight: 100,
    })
    expect(ratios.r1).toBeCloseTo(1.25, 10)
  })

  it('tira error si falta un landmark necesario (array vacío)', () => {
    expect(() =>
      computeFaceRatios({ landmarks: [], hairlinePoint, imageWidth: 100, imageHeight: 100 }),
    ).toThrow()
  })
})
