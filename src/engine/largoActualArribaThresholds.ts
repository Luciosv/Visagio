// Rangos en centímetros de cada bucket de `LargoActualArriba` (Fase 5, quinto
// tap del form del barbero — no está en la sección 7.7 original de
// CLAUDE.md, se agregó en esta fase para poder calcular "expectativas
// alcanzables", sección 9). Mismo patrón que `qualityThresholds.ts` /
// `faceShapeThresholds.ts`: un solo archivo de constantes, comentadas,
// porque son un punto de partida a calibrar con el barbero real, no números
// fijados por la spec.
//
// Terminología investigada contra uso real de barbería (nombres que un
// barbero reconoce al toque, no medidas de laboratorio):
//  - "Rapado/máquina"   (rapado_maquina): 0-3 cm  — desde piel hasta más o
//    menos un #10-#12 de máquina. Recién cortado a máquina sin guía o con
//    guías cortas.
//  - "Corto con tijera" (corto_tijera):   3-6 cm  — ya se puede trabajar a
//    tijera sobre peine, crew cut, buzz corto con textura.
//  - "Media melena"     (media_melena):   6-12 cm — largo suficiente para
//    peinar hacia atrás o al costado (undercut, pompadour, side part).
//  - "Largo"            (largo):          12+ cm  — alcanza para capas
//    largas, atar en rodete, etc. Sin techo: cuanto más largo, sigue siendo
//    "largo" a los fines de esta comparación.
//
// `recommend.ts` usa el MÁXIMO de cada bucket para decidir si un corte es
// alcanzable hoy: un cliente en "media_melena" (hasta 12 cm) todavía no
// llega a un corte que pida 15 cm arriba.

import type { LargoActualArriba } from '../types'

/** Máximo de centímetros de cada bucket (sin techo para `largo`, ver arriba). */
export const LARGO_ACTUAL_ARRIBA_MAX_CM: Record<LargoActualArriba, number> = {
  rapado_maquina: 3,
  corto_tijera: 6,
  media_melena: 12,
  largo: Number.POSITIVE_INFINITY,
}

/**
 * Etiquetas en español rioplatense para los chips del form (sección 17: nada
 * de inglés en UI). Cada una lleva el nombre que el barbero reconoce MÁS el
 * rango en cm al que se refiere (mismos rangos que `LARGO_ACTUAL_ARRIBA_MAX_CM`
 * de arriba): sin el cm el barbero tiene muy poca info para elegir el bucket
 * correcto. Si se recalibran los rangos, actualizar los dos a la vez.
 */
export const LARGO_ACTUAL_ARRIBA_LABELS: Record<LargoActualArriba, string> = {
  rapado_maquina: 'Rapado / máquina · 0-3 cm',
  corto_tijera: 'Corto con tijera · 3-6 cm',
  media_melena: 'Media melena · 6-12 cm',
  largo: 'Largo · 12+ cm',
}
