import { describe, expect, it } from 'vitest'
import type { FaceRatios } from '../types'
import { classifyFaceShape, explainFaceShape } from './faceShape'

/** Arma un `FaceRatios` completo pisando solo los campos relevantes al test. */
function buildRatios(overrides: Partial<FaceRatios>): FaceRatios {
  return {
    r1: 1.4,
    r2: 0.9,
    r3: 0.85,
    r4: 130,
    r5: 0.33,
    r6: { frente: 0.33, nariz: 0.33, menton: 0.34 },
    ...overrides,
  }
}

describe('classifyFaceShape', () => {
  it('clasifica alargada como top-1 cuando R1 es muy alto', () => {
    // Cara mucho más larga que ancha, resto de los ratios neutros.
    const ratios = buildRatios({ r1: 2.0, r2: 0.9, r3: 0.85, r4: 130 })
    const result = classifyFaceShape(ratios)
    expect(result.top1.shape).toBe('alargada')
  })

  it('clasifica redonda como top-1 cuando R1~1, frente y mandíbula ~ pómulos, ángulo obtuso', () => {
    const ratios = buildRatios({ r1: 1.0, r2: 0.95, r3: 0.95, r4: 150 })
    const result = classifyFaceShape(ratios)
    expect(result.top1.shape).toBe('redonda')
  })

  it('clasifica cuadrada como top-1 cuando R1~1.1, mandíbula ancha y ángulo marcado', () => {
    const ratios = buildRatios({ r1: 1.1, r2: 0.9, r3: 1.0, r4: 100 })
    const result = classifyFaceShape(ratios)
    expect(result.top1.shape).toBe('cuadrada')
  })

  it('clasifica ovalada como top-1 con R1 moderadamente alto y mandíbula algo más angosta', () => {
    const ratios = buildRatios({ r1: 1.45, r2: 0.88, r3: 0.85, r4: 128 })
    const result = classifyFaceShape(ratios)
    expect(result.top1.shape).toBe('ovalada')
  })

  it('clasifica corazón como top-1 cuando la frente es notablemente más ancha que la mandíbula', () => {
    const ratios = buildRatios({ r1: 1.4, r2: 1.05, r3: 0.65, r4: 130 })
    const result = classifyFaceShape(ratios)
    expect(result.top1.shape).toBe('corazon')
  })

  it('clasifica diamante como top-1 cuando pómulos son el punto más ancho (frente y mandíbula bajos)', () => {
    const ratios = buildRatios({ r1: 1.4, r2: 0.65, r3: 0.65, r4: 130 })
    const result = classifyFaceShape(ratios)
    expect(result.top1.shape).toBe('diamante')
  })

  it('clasifica triangular como top-1 cuando la mandíbula es más ancha que la frente', () => {
    const ratios = buildRatios({ r1: 1.3, r2: 0.65, r3: 1.1, r4: 130 })
    const result = classifyFaceShape(ratios)
    expect(result.top1.shape).toBe('triangular')
  })

  it('devuelve las 7 formas con confianzas que suman 1 (o reparten parejo si todo da 0)', () => {
    const ratios = buildRatios({})
    const result = classifyFaceShape(ratios)
    expect(result.scores).toHaveLength(7)
    const totalConfidence = result.scores.reduce((sum, s) => sum + s.confidence, 0)
    expect(totalConfidence).toBeCloseTo(1, 10)
  })

  it('ordena los scores de mayor a menor confianza', () => {
    const ratios = buildRatios({ r1: 2.0, r2: 0.9, r3: 0.85, r4: 130 })
    const result = classifyFaceShape(ratios)
    for (let i = 1; i < result.scores.length; i++) {
      expect(result.scores[i - 1].confidence).toBeGreaterThanOrEqual(result.scores[i].confidence)
    }
    expect(result.top1).toBe(result.scores[0])
    expect(result.top2).toBe(result.scores[1])
  })

  it('caso ambiguo: R1 alto empuja alargada y ovalada a un puntaje parecido, top-2 queda parejo', () => {
    // R1=1.65 está en la cola alta de "ovalada" y ya arrancando "alargada"
    // (ver R1_ALARGADA_START/R1_OVALADA_RANGE en faceShapeThresholds.ts), con
    // R3 en el rango de "ovalada". Es un caso real de ambigüedad esperable:
    // el límite entre oval y oblonga es un continuo, no un salto.
    const ratios = buildRatios({ r1: 1.65, r2: 0.88, r3: 0.85, r4: 128 })
    const result = classifyFaceShape(ratios)
    const shapes = result.scores.slice(0, 2).map((s) => s.shape)
    expect(shapes).toEqual(expect.arrayContaining(['alargada', 'ovalada']))
    // "Parejo": la diferencia de confianza entre el top-1 y el top-2 es chica
    // comparada con, por ejemplo, el caso bien marcado de arriba (R1=2.0).
    const gap = result.top1.confidence - result.top2.confidence
    expect(gap).toBeLessThan(0.15)
  })

  it('nunca deja NaN en ningún score, incluso con ratios en cero (caso degenerado)', () => {
    const ratios = buildRatios({ r1: 0, r2: 0, r3: 0, r4: 0 })
    const result = classifyFaceShape(ratios)
    for (const score of result.scores) {
      expect(Number.isNaN(score.rawScore)).toBe(false)
      expect(Number.isNaN(score.confidence)).toBe(false)
    }
  })
})

describe('explainFaceShape', () => {
  it('genera una frase con las dos formas, sus porcentajes y una cláusula por ratio', () => {
    const ratios = buildRatios({ r1: 2.0, r2: 0.9, r3: 0.85, r4: 130 })
    const classification = classifyFaceShape(ratios)
    const text = explainFaceShape(classification, ratios)

    expect(text).toContain('Alargada')
    expect(text).toMatch(/\d+%/)
    expect(text).toContain('2.00× más larga que ancha')
    expect(text.endsWith('.')).toBe(true)
  })
})
