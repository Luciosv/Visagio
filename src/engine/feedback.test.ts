import { describe, expect, it } from 'vitest'
import type { BuildFeedbackEventoInput } from './feedback'
import { buildFeedbackEvento } from './feedback'
import type { FaceRatios } from '../types'

function buildRatios(overrides: Partial<FaceRatios> = {}): FaceRatios {
  return {
    r1: 1.62,
    r2: 0.88,
    r3: 0.94,
    r4: 118,
    r5: 0.33,
    r6: { frente: 0.34, nariz: 0.33, menton: 0.33 },
    ...overrides,
  }
}

function buildInput(overrides: Partial<BuildFeedbackEventoInput> = {}): BuildFeedbackEventoInput {
  return {
    sesion: 'uuid-sesion',
    ratios: buildRatios(),
    formaSugerida: { shape: 'alargada', rawScore: 1.4, confidence: 0.61 },
    formaCorregida: null,
    ajusteLineaNacimiento: 0.07,
    barberInput: { textura: 'ondulado', densidad: 'medio', flags: ['remolino_coronilla'] },
    ranking: ['french-crop', 'low-fade-texturizado', 'taper-bajo'],
    elegido: 'taper-bajo',
    descartados: [{ id: 'french-crop', motivo: 'no_le_gusta_al_cliente' }],
    segundosEnPantalla: 34,
    now: () => new Date('2026-08-03T14:22:00.000Z'),
    ...overrides,
  }
}

describe('buildFeedbackEvento', () => {
  it('arma el evento con el formato exacto de la sección 2.3', () => {
    const evento = buildFeedbackEvento(buildInput())

    expect(evento).toEqual({
      ts: '2026-08-03T14:22:00.000Z',
      sesion: 'uuid-sesion',
      ratios: buildRatios(),
      formaSugerida: ['alargada', 0.61],
      formaCorregida: null,
      ajusteLineaNacimiento: 0.07,
      form: { textura: 'ondulado', densidad: 'medio', flags: ['remolino_coronilla'] },
      ranking: ['french-crop', 'low-fade-texturizado', 'taper-bajo'],
      elegido: 'taper-bajo',
      descartados: [{ id: 'french-crop', motivo: 'no_le_gusta_al_cliente' }],
      segundosEnPantalla: 34,
    })
  })

  it('manda las 6 razones completas (R1-R6), no solo R1-R4 del ejemplo recortado del doc', () => {
    const evento = buildFeedbackEvento(buildInput())
    expect(Object.keys(evento.ratios)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6'])
  })

  it('formaCorregida queda en null si el barbero no tocó el selector', () => {
    const evento = buildFeedbackEvento(buildInput({ formaCorregida: null }))
    expect(evento.formaCorregida).toBeNull()
  })

  it('formaCorregida lleva la forma corregida cuando el barbero la pisó', () => {
    const evento = buildFeedbackEvento(buildInput({ formaCorregida: 'ovalada' }))
    expect(evento.formaCorregida).toBe('ovalada')
  })

  it('ajusteLineaNacimiento puede ser null (consulta sin foto nueva, ej. "Ajustar" sobre una ficha existente)', () => {
    const evento = buildFeedbackEvento(buildInput({ ajusteLineaNacimiento: null }))
    expect(evento.ajusteLineaNacimiento).toBeNull()
  })

  it('descartados puede quedar vacío si no se descartó ningún corte antes de "Este hice"', () => {
    const evento = buildFeedbackEvento(buildInput({ descartados: [] }))
    expect(evento.descartados).toEqual([])
  })

  it('form solo lleva textura/densidad/flags, igual que el ejemplo de la sección 2.3 (sin minutosDeclarados ni largoActualArriba)', () => {
    const evento = buildFeedbackEvento(buildInput())
    expect(Object.keys(evento.form)).toEqual(['textura', 'densidad', 'flags'])
  })

  it('nunca lleva foto, landmarks crudos ni alias/nombre del cliente: la firma de la función ni los recibe', () => {
    // Prueba estructural, no solo de contenido (mismo criterio que
    // `shareCard.test.ts`): `buildFeedbackEvento` toma un objeto plano de
    // números/strings/ids, ninguno de sus campos es una foto, un array de
    // landmarks ni un alias, así que no hay forma de que se filtren por
    // accidente. Se verifica además el set exacto de claves del resultado.
    const evento = buildFeedbackEvento(buildInput())
    expect(Object.keys(evento).sort()).toEqual(
      [
        'ts',
        'sesion',
        'ratios',
        'formaSugerida',
        'formaCorregida',
        'ajusteLineaNacimiento',
        'form',
        'ranking',
        'elegido',
        'descartados',
        'segundosEnPantalla',
      ].sort(),
    )
    const serialized = JSON.stringify(evento).toLowerCase()
    expect(serialized).not.toContain('alias')
    expect(serialized).not.toContain('foto')
    expect(serialized).not.toContain('landmark')
    expect(serialized).not.toContain('nombre')
  })
})
