// Contenido de la ficha compartible (segunda mitad de la Fase 5, secciones
// 2.2 y 10 de CLAUDE.md). Función pura y testeable (sección 17: "vision/ y
// engine/ con funciones puras y testeables"): entra la recomendación ya
// puntuada más la config, sale la estructura de texto que después dibuja el
// canvas en `src/shareImage.ts` (ese archivo SÍ toca el DOM, este no).
//
// CRÍTICO (sección 14 y 2.2, releer antes de tocar esto): esta ficha es para
// el CLIENTE, no para el barbero. Nunca puede llevar:
//   - la foto del cliente (esta función ni siquiera recibe una foto)
//   - la palabra "IA" / "inteligencia artificial"
//   - porcentajes de confianza de forma de cara (eso es "interno del
//     barbero, no del cliente" — sección 2.2)
// Por diseño, `buildShareCardContent` solo recibe `CutRecommendation` +
// `AppConfig`, ninguno de los dos trae `FaceShapeClassification` ni
// confianzas: es estructuralmente imposible que se cuelen acá. No cambiar la
// firma para aceptar esos datos sin volver a leer esta nota.

import type { AppConfig, CutRecommendation } from '../types'

/** Contenido ya armado de la ficha compartible: nombre, mantenimiento, producto/peinado y marca (sección 2.2). Solo lo que le sirve al CLIENTE — la spec técnica de máquina es lenguaje del barbero y queda en el Detalle de la app, no en esta ficha (CLAUDE.md 2.2, decisión revisada). */
export interface ShareCardContent {
  readonly nombreCorte: string
  /** Ruta a la imagen de maniquí 3/4 (sección 15), la misma que ya se usa en la card y el detalle. */
  readonly imagen: string
  /** "Cada cuánto volver", en una frase ya armada. */
  readonly mantenimiento: string
  /** Producto sugerido + cuánto tarda en peinarse, en una frase ya armada. */
  readonly peinado: string
  /** Marca de la barbería (sección 2.2: "marca de la barbería"). Puede venir vacía si el barbero todavía no la cargó (ver `AppConfig.nombreBarberia`). */
  readonly nombreBarberia: string
}

export function buildShareCardContent(recommendation: CutRecommendation, config: AppConfig): ShareCardContent {
  const { cut } = recommendation

  return {
    nombreCorte: cut.nombre,
    imagen: cut.imagenes.tresCuartos,
    mantenimiento: buildMantenimientoLinea(cut.mantenimientoSemanas),
    peinado: buildPeinadoLinea(cut.producto, cut.minutosDePeinado),
    nombreBarberia: config.nombreBarberia,
  }
}

function buildMantenimientoLinea(mantenimientoSemanas: number): string {
  const plural = mantenimientoSemanas === 1 ? 'semana' : 'semanas'
  return `Volvé cada ${mantenimientoSemanas} ${plural}`
}

function buildPeinadoLinea(producto: string, minutosDePeinado: number): string {
  if (minutosDePeinado <= 0) return `${producto} — no hace falta peinarlo`
  const plural = minutosDePeinado === 1 ? 'minuto' : 'minutos'
  return `${producto} · ~${minutosDePeinado} ${plural} para peinarlo a la mañana`
}
