import { describe, expect, it } from 'vitest'
import type { BarberInput, ClientFlag, Cut, FaceRatios, FaceShape, FaceShapeClassification, FaceShapeScore } from '../types'
import { FACE_SHAPES } from '../types'
import { CLIENT_FLAG_LABELS, explainRecommendation } from './explain'
import { scoreCut } from './recommend'

function buildCut(overrides: Partial<Cut> & Pick<Cut, 'id'>): Cut {
  const zeroForma = Object.fromEntries(FACE_SHAPES.map((shape) => [shape, 0])) as Record<FaceShape, number>
  const defaults: Cut = {
    id: overrides.id,
    nombre: overrides.id,
    longitud: 'corto',
    afinidadForma: zeroForma,
    afinidadTextura: { lacio: 0, ondulado: 0, rulo: 0, muy_rizado: 0 },
    afinidadDensidad: { fino: 0, medio: 0, grueso: 0 },
    favorece: [],
    penaliza: [],
    spec: { costados: '', arriba: '', nuca: '', contorno: '' },
    pasos: [],
    cuidados: [],
    mantenimientoSemanas: 4,
    minutosDePeinado: 0,
    dificultad: 1,
    tiempoEjecucionMin: 20,
    verificado: false,
    producto: 'sin producto',
    imagenes: { tresCuartos: '/cuts/placeholder-3-4.svg', posterior: '/cuts/placeholder-posterior.svg' },
    largoMinimoArribaCm: 0,
  }
  return { ...defaults, ...overrides }
}

function buildClassification(
  top1Shape: FaceShape,
  top1Confidence: number,
  top2Shape: FaceShape,
  top2Confidence: number,
): FaceShapeClassification {
  const rest = FACE_SHAPES.filter((s) => s !== top1Shape && s !== top2Shape)
  const restConfidence = (1 - top1Confidence - top2Confidence) / rest.length
  const scores: FaceShapeScore[] = FACE_SHAPES.map((shape) => {
    if (shape === top1Shape) return { shape, rawScore: top1Confidence, confidence: top1Confidence }
    if (shape === top2Shape) return { shape, rawScore: top2Confidence, confidence: top2Confidence }
    return { shape, rawScore: restConfidence, confidence: restConfidence }
  }).sort((a, b) => b.confidence - a.confidence)
  return { scores, top1: scores[0], top2: scores[1] }
}

function buildRatios(overrides: Partial<FaceRatios> = {}): FaceRatios {
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

function buildBarberInput(overrides: Partial<BarberInput> = {}): BarberInput {
  return {
    textura: 'lacio',
    densidad: 'medio',
    flags: [],
    minutosDeclarados: 5,
    largoActualArriba: 'media_melena',
    ...overrides,
  }
}

describe('explainRecommendation', () => {
  it('cita el ratio concreto de la forma top-1 cuando es el término que más pesa', () => {
    const ratios = buildRatios({ r1: 2.0 })
    const classification = buildClassification('alargada', 0.6, 'ovalada', 0.1)
    const barberInput = buildBarberInput()
    const cut = buildCut({ id: 'c', afinidadForma: { ...buildCut({ id: 'x' }).afinidadForma, alargada: 5 } })

    const recommendation = scoreCut(cut, classification, barberInput)
    const text = explainRecommendation(recommendation, classification, ratios, barberInput)

    expect(text).toContain('Sumó por')
    expect(text).toContain('2.00× más larga que ancha')
    expect(text).not.toContain('Restó')
    expect(text.endsWith('.')).toBe(true)
  })

  it('cita el flag de favorece concreto cuando el bonus es el término dominante', () => {
    const ratios = buildRatios()
    // Forma casi sin afinidad ni confianza fuerte, para que el bonus de favorece domine.
    const classification = buildClassification('ovalada', 0.2, 'redonda', 0.2)
    const barberInput = buildBarberInput({ flags: ['entradas'] })
    const cut = buildCut({
      id: 'c',
      afinidadForma: { ...buildCut({ id: 'x' }).afinidadForma, ovalada: 1, redonda: 1 },
      favorece: ['entradas'],
    })

    const recommendation = scoreCut(cut, classification, barberInput)
    const text = explainRecommendation(recommendation, classification, ratios, barberInput)

    expect(text).toContain(CLIENT_FLAG_LABELS.entradas)
  })

  it('agrega la cláusula "Restó" citando el flag de penaliza concreto cuando hay una penalización', () => {
    const ratios = buildRatios({ r1: 2.0 })
    const classification = buildClassification('alargada', 0.6, 'ovalada', 0.1)
    const flags: ClientFlag[] = ['remolino_coronilla']
    const barberInput = buildBarberInput({ flags })
    const cut = buildCut({
      id: 'c',
      afinidadForma: { ...buildCut({ id: 'x' }).afinidadForma, alargada: 5 },
      penaliza: ['remolino_coronilla'],
    })

    const recommendation = scoreCut(cut, classification, barberInput)
    const text = explainRecommendation(recommendation, classification, ratios, barberInput)

    expect(text).toContain('Restó')
    expect(text).toContain(CLIENT_FLAG_LABELS.remolino_coronilla)
  })

  it('cita el exceso de minutos de peinado cuando esa es la única penalización', () => {
    const ratios = buildRatios({ r1: 2.0 })
    const classification = buildClassification('alargada', 0.6, 'ovalada', 0.1)
    const barberInput = buildBarberInput({ minutosDeclarados: 0 })
    const cut = buildCut({
      id: 'c',
      afinidadForma: { ...buildCut({ id: 'x' }).afinidadForma, alargada: 5 },
      minutosDePeinado: 8,
    })

    const recommendation = scoreCut(cut, classification, barberInput)
    const text = explainRecommendation(recommendation, classification, ratios, barberInput)

    expect(text).toContain('Restó')
    expect(text).toContain('8 min de peinado')
  })

  it('nunca devuelve una frase genérica: siempre incluye un número (ratio, afinidad o minutos)', () => {
    const ratios = buildRatios()
    const classification = buildClassification('cuadrada', 0.3, 'redonda', 0.25)
    const barberInput = buildBarberInput()
    const cut = buildCut({ id: 'c', afinidadForma: { ...buildCut({ id: 'x' }).afinidadForma, cuadrada: 3 } })

    const recommendation = scoreCut(cut, classification, barberInput)
    const text = explainRecommendation(recommendation, classification, ratios, barberInput)

    expect(text).toMatch(/\d/)
  })
})
