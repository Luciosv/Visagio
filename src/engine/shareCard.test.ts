import { describe, expect, it } from 'vitest'
import type { AppConfig, Cut, CutRecommendation, FaceShape } from '../types'
import { FACE_SHAPES } from '../types'
import { buildShareCardContent } from './shareCard'

/** Cut sintético con los campos que le importan a la ficha compartible; el resto queda en valores neutros. */
function buildCut(overrides: Partial<Cut> & Pick<Cut, 'id'>): Cut {
  const zeroForma = Object.fromEntries(FACE_SHAPES.map((shape) => [shape, 0])) as Record<FaceShape, number>
  const defaults: Cut = {
    id: overrides.id,
    nombre: 'Taper bajo',
    longitud: 'corto',
    afinidadForma: zeroForma,
    afinidadTextura: { lacio: 0, ondulado: 0, rulo: 0, muy_rizado: 0 },
    afinidadDensidad: { fino: 0, medio: 0, grueso: 0 },
    favorece: [],
    penaliza: [],
    spec: {
      costados: 'degradado de piel a #2',
      arriba: '4-6 cm',
      nuca: 'degradado bajo',
      contorno: 'difuminado',
    },
    pasos: ['paso 1'],
    cuidados: ['cuidado 1'],
    mantenimientoSemanas: 2,
    minutosDePeinado: 3,
    dificultad: 3,
    tiempoEjecucionMin: 25,
    verificado: false,
    producto: 'pomada o crema liviana',
    imagenes: { tresCuartos: '/cuts/placeholder-3-4.svg', posterior: '/cuts/placeholder-posterior.svg' },
    largoMinimoArribaCm: 4,
  }
  return { ...defaults, ...overrides }
}

function buildRecommendation(cutOverrides: Partial<Cut> & Pick<Cut, 'id'> = { id: 'taper-bajo' }): CutRecommendation {
  return {
    cut: buildCut(cutOverrides),
    score: 4.2,
    breakdown: {
      formaTop1: 3,
      formaTop2: 1,
      textura: 0.5,
      densidad: 0.5,
      bonusFavorece: 0,
      penalizacionPenaliza: 0,
      penalizacionPeinado: 0,
      favoreceCoincidentes: [],
      penalizaCoincidentes: [],
      minutosExceso: 0,
    },
    caminoEnVariosCortes: false,
  }
}

function buildConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return { mostrarDebug: false, nombreBarberia: 'Barbería Central', ...overrides }
}

describe('buildShareCardContent', () => {
  it('incluye el nombre del corte, la imagen y la marca de la barbería', () => {
    const content = buildShareCardContent(buildRecommendation(), buildConfig())

    expect(content.nombreCorte).toBe('Taper bajo')
    expect(content.imagen).toBe('/cuts/placeholder-3-4.svg')
    expect(content.nombreBarberia).toBe('Barbería Central')
  })

  it('arma la spec técnica en texto plano, una línea por zona', () => {
    const content = buildShareCardContent(buildRecommendation(), buildConfig())

    expect(content.specLineas).toEqual([
      'Costados: degradado de piel a #2',
      'Arriba: 4-6 cm',
      'Nuca: degradado bajo',
      'Contorno: difuminado',
    ])
  })

  it('arma la frase de mantenimiento con las semanas del corte', () => {
    const content = buildShareCardContent(
      buildRecommendation({ id: 'x', mantenimientoSemanas: 3 }),
      buildConfig(),
    )
    expect(content.mantenimiento).toBe('Volvé cada 3 semanas')
  })

  it('usa singular "semana" cuando el mantenimiento es de 1 semana', () => {
    const content = buildShareCardContent(
      buildRecommendation({ id: 'x', mantenimientoSemanas: 1 }),
      buildConfig(),
    )
    expect(content.mantenimiento).toBe('Volvé cada 1 semana')
  })

  it('arma la frase de peinado con el producto y los minutos declarados', () => {
    const content = buildShareCardContent(
      buildRecommendation({ id: 'x', producto: 'cera mate', minutosDePeinado: 5 }),
      buildConfig(),
    )
    expect(content.peinado).toBe('cera mate · ~5 minutos para peinarlo a la mañana')
  })

  it('cuando el corte no necesita peinado, no inventa minutos', () => {
    const content = buildShareCardContent(
      buildRecommendation({ id: 'x', producto: 'ninguno, no hace falta peinarlo', minutosDePeinado: 0 }),
      buildConfig(),
    )
    expect(content.peinado).toBe('ninguno, no hace falta peinarlo — no hace falta peinarlo')
  })

  it('nunca incluye porcentajes, confianza ni menciones de IA (sección 14: la ficha es para el cliente, no para el barbero)', () => {
    const content = buildShareCardContent(buildRecommendation(), buildConfig())
    const serialized = JSON.stringify(content).toLowerCase()

    expect(serialized).not.toContain('%')
    expect(serialized).not.toContain('confianza')
    expect(serialized).not.toContain('ia ')
    expect(serialized).not.toMatch(/\bia\b/)
    expect(serialized).not.toContain('inteligencia artificial')
    expect(serialized).not.toContain('score')
    expect(serialized).not.toContain('breakdown')
  })

  it('no lleva ningún campo de ratios ni de forma de cara: la firma de la función ni los recibe', () => {
    // Prueba estructural, no solo de contenido: `buildShareCardContent` toma
    // `CutRecommendation` + `AppConfig`, ninguno trae `FaceShapeClassification`
    // ni `FaceRatios`, así que no hay forma de que se filtren por accidente.
    const content = buildShareCardContent(buildRecommendation(), buildConfig())
    const keys = Object.keys(content)

    expect(keys).toEqual(['nombreCorte', 'imagen', 'specLineas', 'mantenimiento', 'peinado', 'nombreBarberia'])
  })
})
