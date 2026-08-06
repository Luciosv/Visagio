import { describe, expect, it } from 'vitest'
import type { BarberInput, ClientFlag, Cut, FaceShape, FaceShapeClassification, FaceShapeScore } from '../types'
import { FACE_SHAPES } from '../types'
import { recommendCuts, scoreCut } from './recommend'

/** Cut sintético con todas las afinidades neutras (0) salvo las que se pisen — así cada test solo mueve la variable que le importa. */
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
    imagenes: { tresCuartos: '/cuts/placeholder-3-4.svg', posterior: '/cuts/placeholder-posterior.svg' },
  }
  return { ...defaults, ...overrides }
}

/** Clasificación sintética con top1/top2 fijados a las formas y confianzas que pida el test; el resto reparte lo que queda entre las 5 formas restantes. */
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

function buildBarberInput(overrides: Partial<BarberInput> = {}): BarberInput {
  return {
    textura: 'lacio',
    densidad: 'medio',
    flags: [],
    minutosDeclarados: 5,
    ...overrides,
  }
}

describe('scoreCut', () => {
  it('un afinidad de forma más alta en el top-1 da un score mayor, todo lo demás igual', () => {
    const classification = buildClassification('alargada', 0.5, 'ovalada', 0.2)
    const barberInput = buildBarberInput()

    const cutAlto = buildCut({ id: 'alto', afinidadForma: { ...buildCut({ id: 'x' }).afinidadForma, alargada: 5 } })
    const cutBajo = buildCut({ id: 'bajo', afinidadForma: { ...buildCut({ id: 'x' }).afinidadForma, alargada: 1 } })

    const altoResult = scoreCut(cutAlto, classification, barberInput)
    const bajoResult = scoreCut(cutBajo, classification, barberInput)

    expect(altoResult.score).toBeGreaterThan(bajoResult.score)
    // formaTop1 = W1 * afinidad * confianza = 4 * 5 * 0.5 = 10
    expect(altoResult.breakdown.formaTop1).toBeCloseTo(10, 10)
  })

  it('el top-2 pesa menos que el top-1 con la misma afinidad y confianza', () => {
    const classification = buildClassification('alargada', 0.4, 'ovalada', 0.4)
    const barberInput = buildBarberInput()
    const afinidadForma = { ...buildCut({ id: 'x' }).afinidadForma, alargada: 4, ovalada: 4 }
    const cut = buildCut({ id: 'c', afinidadForma })

    const result = scoreCut(cut, classification, barberInput)
    // Misma afinidad (4) y misma confianza (0.4) para top1 y top2, pero W1 > W2.
    expect(result.breakdown.formaTop1).toBeGreaterThan(result.breakdown.formaTop2)
  })

  it('afinidad de textura y densidad suman al score', () => {
    const classification = buildClassification('ovalada', 0.3, 'redonda', 0.2)
    const barberInput = buildBarberInput({ textura: 'rulo', densidad: 'grueso' })
    const cut = buildCut({
      id: 'c',
      afinidadTextura: { lacio: 0, ondulado: 0, rulo: 5, muy_rizado: 0 },
      afinidadDensidad: { fino: 0, medio: 0, grueso: 5 },
    })

    const result = scoreCut(cut, classification, barberInput)
    expect(result.breakdown.textura).toBeGreaterThan(0)
    expect(result.breakdown.densidad).toBeGreaterThan(0)
  })

  it('un flag del cliente que matchea favorece suma bonus y queda listado en favoreceCoincidentes', () => {
    const classification = buildClassification('ovalada', 0.3, 'redonda', 0.2)
    const flags: ClientFlag[] = ['entradas']
    const cut = buildCut({ id: 'c', favorece: ['entradas', 'gorra_o_casco'] })

    const conFlag = scoreCut(cut, classification, buildBarberInput({ flags }))
    const sinFlag = scoreCut(cut, classification, buildBarberInput({ flags: [] }))

    expect(conFlag.score).toBeGreaterThan(sinFlag.score)
    expect(conFlag.breakdown.favoreceCoincidentes).toEqual(['entradas'])
    expect(conFlag.breakdown.bonusFavorece).toBeGreaterThan(0)
    expect(sinFlag.breakdown.bonusFavorece).toBe(0)
  })

  it('un flag del cliente que matchea penaliza resta del score y queda listado en penalizaCoincidentes', () => {
    const classification = buildClassification('ovalada', 0.3, 'redonda', 0.2)
    const flags: ClientFlag[] = ['remolino_coronilla']
    const cut = buildCut({ id: 'c', penaliza: ['remolino_coronilla'] })

    const conFlag = scoreCut(cut, classification, buildBarberInput({ flags }))
    const sinFlag = scoreCut(cut, classification, buildBarberInput({ flags: [] }))

    expect(conFlag.score).toBeLessThan(sinFlag.score)
    expect(conFlag.breakdown.penalizaCoincidentes).toEqual(['remolino_coronilla'])
    expect(conFlag.breakdown.penalizacionPenaliza).toBeGreaterThan(0)
  })

  it('penaliza por minuto de exceso solo cuando minutosDePeinado > minutosDeclarados', () => {
    const classification = buildClassification('ovalada', 0.3, 'redonda', 0.2)
    const cutExigente = buildCut({ id: 'exigente', minutosDePeinado: 10 })
    const cutRapido = buildCut({ id: 'rapido', minutosDePeinado: 2 })
    const barberInput = buildBarberInput({ minutosDeclarados: 2 })

    const exigenteResult = scoreCut(cutExigente, classification, barberInput)
    const rapidoResult = scoreCut(cutRapido, classification, barberInput)

    expect(exigenteResult.breakdown.minutosExceso).toBe(8)
    expect(exigenteResult.breakdown.penalizacionPeinado).toBeGreaterThan(0)
    expect(rapidoResult.breakdown.minutosExceso).toBe(0)
    expect(rapidoResult.breakdown.penalizacionPeinado).toBe(0)
    expect(rapidoResult.score).toBeGreaterThan(exigenteResult.score)
  })

  it('no penaliza cuando el cliente declaró más minutos de los que pide el corte', () => {
    const classification = buildClassification('ovalada', 0.3, 'redonda', 0.2)
    const cut = buildCut({ id: 'c', minutosDePeinado: 2 })
    const barberInput = buildBarberInput({ minutosDeclarados: 10 })

    const result = scoreCut(cut, classification, barberInput)
    expect(result.breakdown.minutosExceso).toBe(0)
    expect(result.breakdown.penalizacionPeinado).toBe(0)
  })
})

describe('recommendCuts', () => {
  it('devuelve el ranking completo (no solo el top-N), ordenado de mayor a menor score', () => {
    const classification = buildClassification('alargada', 0.5, 'ovalada', 0.2)
    const barberInput = buildBarberInput()
    const cuts = [
      buildCut({ id: 'malo', afinidadForma: { ...buildCut({ id: 'x' }).afinidadForma, alargada: 0 } }),
      buildCut({ id: 'medio', afinidadForma: { ...buildCut({ id: 'x' }).afinidadForma, alargada: 2 } }),
      buildCut({ id: 'bueno', afinidadForma: { ...buildCut({ id: 'x' }).afinidadForma, alargada: 5 } }),
    ]

    const ranking = recommendCuts(cuts, classification, barberInput)

    expect(ranking).toHaveLength(3)
    expect(ranking.map((r) => r.cut.id)).toEqual(['bueno', 'medio', 'malo'])
    for (let i = 1; i < ranking.length; i++) {
      expect(ranking[i - 1].score).toBeGreaterThanOrEqual(ranking[i].score)
    }
  })
})
