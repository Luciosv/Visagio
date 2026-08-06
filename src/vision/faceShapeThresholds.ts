// Umbrales de la clasificación difusa de forma de cara (sección 7.6 de
// CLAUDE.md). Todos en un solo archivo, comentados, mismo patrón que
// `qualityThresholds.ts` (sección 17: "los umbrales de clasificación en un
// solo archivo de constantes, comentados con su justificación").
//
// OJO GRANDE: a diferencia del gate de calidad (7.3), que trae números
// concretos en la spec, la sección 7.6 da una guía CUALITATIVA por forma
// ("R1 alto", "R3 cercano a R2", etc.) pero no fija los rangos numéricos.
// Todos los valores de acá son un criterio propio de arranque, apoyado en
// literatura general de proporciones faciales (relación largo/ancho ~1.5
// para "ovalada" como forma de referencia, mandíbula/pómulo cercana a 1 para
// formas angulosas, etc.), NO en un dataset ni en fotos reales de barbería
// todavía. Es exactamente el tipo de supuesto que la sección 18 pide señalar
// en vez de esconder: "si un umbral... parece dudoso, decirlo en vez de
// elegir uno y seguir". Van a cambiar con calibración real (Fase 2 del plan
// general ya pidió lo mismo para `metrics.ts`).
//
// Cada forma se puntúa como el promedio de 2-4 "membresías difusas" (0 a 1)
// sobre R1-R4, elegidas para calzar 1 a 1 con la guía de la sección 7.6 del
// prompt de esta fase (cada bloque de constantes cita qué frase de esa guía
// intenta capturar). R5 y R6 no se usan todavía: la guía no los menciona
// para ninguna forma, y sumarlos sin criterio del barbero detrás sería
// inventar de más.

// ---------------------------------------------------------------------------
// R1 — largo de cara / ancho bicigomático
// ---------------------------------------------------------------------------

/** Redonda: "R1 cercano a 1 (poco más larga que ancha)". Pico en 1.0. */
export const R1_REDONDA_RANGE = [0.85, 0.95, 1.05, 1.15] as const

/** Cuadrada: "R1 cercano a 1-1.2". */
export const R1_CUADRADA_RANGE = [0.95, 1.05, 1.15, 1.3] as const

/**
 * Ovalada: "R1 moderadamente alto (más larga que ancha pero no extremo)".
 * Meseta 1.35-1.55 centrada en ~1.45, el valor que la literatura de
 * proporciones clásicas suele citar como "ideal" de referencia para la cara
 * ovalada (por eso 7.6 la llama "forma de referencia/equilibrada").
 */
export const R1_OVALADA_RANGE = [1.2, 1.35, 1.55, 1.7] as const

/**
 * Alargada/oblonga: "R1 alto". Sin techo (meseta en 1 para siempre a partir
 * de 1.75): cuanto más larga, más alargada, no hay un punto de "demasiado".
 */
export const R1_ALARGADA_START = 1.55
export const R1_ALARGADA_FULL = 1.75

/**
 * Corazón, diamante y triangular: la 7.6 no da un rango de R1 para estas
 * tres, las define por R2/R3. Se usa una meseta ancha y suave (no hay "R1
 * ideal" fuerte para estas formas, solo se descarta que sea extremadamente
 * corta o extremadamente alargada) para que R1 aporte poco peso sin
 * contradecir a R2/R3 si el resto de la cara calza bien.
 */
export const R1_ANGULAR_BROAD_RANGE = [1.0, 1.2, 1.55, 1.75] as const

// ---------------------------------------------------------------------------
// R3 — ancho mandibular / ancho bicigomático
// ---------------------------------------------------------------------------

/**
 * Cuadrada: "R3 alto (mandíbula casi tan ancha como los pómulos)". Sin
 * techo: mandíbula igual o incluso levemente más ancha que los pómulos sigue
 * siendo plenamente "cuadrada" en este eje (el ángulo R4 es lo que la separa
 * de triangular).
 */
export const R3_CUADRADA_START = 0.9
export const R3_CUADRADA_FULL = 0.97

/**
 * Redonda: mandíbula ancha como en cuadrada, pero acá se usa un rango algo
 * más angosto y CON techo (a diferencia de cuadrada) porque en la cara
 * redonda la mandíbula no suele superar a los pómulos, solo acercárseles; lo
 * que la distingue de cuadrada es el ángulo suave de R4, no el ancho.
 */
export const R3_REDONDA_RANGE = [0.85, 0.92, 1.0, 1.08] as const

/** Ovalada: "R3 algo menor que 1 (mandíbula un poco más angosta que los pómulos)". */
export const R3_OVALADA_RANGE = [0.72, 0.8, 0.9, 0.97] as const

/**
 * Triangular: "R3 alto respecto de R2 (mandíbula más ancha que la frente)".
 * Componente absoluto: mandíbula ancha, sin techo (puede superar a los
 * pómulos en casos marcados).
 */
export const R3_TRIANGULAR_START = 0.95
export const R3_TRIANGULAR_FULL = 1.05

/**
 * Corazón: "mandíbula notablemente más angosta" que la frente. Componente
 * absoluto: plena por debajo de 0.72, cae a 0 en 0.85.
 */
export const R3_CORAZON_FULL = 0.72
export const R3_CORAZON_END = 0.85

/**
 * Diamante: "R3 bajo" (pómulos son el punto más ancho). Rango un poco más
 * permisivo que corazón porque en diamante lo decisivo es que R2 TAMBIÉN sea
 * bajo (ver más abajo), no solo R3.
 */
export const R3_DIAMANTE_FULL = 0.75
export const R3_DIAMANTE_END = 0.88

// ---------------------------------------------------------------------------
// R2 — ancho de frente / ancho bicigomático
// ---------------------------------------------------------------------------

/** Redonda, cuadrada y ovalada: frente de ancho moderado, ni muy angosta ni dominante. */
export const R2_MODERADA_RANGE = [0.78, 0.85, 0.95, 1.02] as const

/**
 * Corazón: "R2 alto respecto de R3 (frente notablemente más ancha)".
 * Componente absoluto: sin techo, cuanto más ancha la frente más "corazón".
 */
export const R2_CORAZON_START = 0.92
export const R2_CORAZON_FULL = 1.0

/** Diamante: "R2 bajo" (frente angosta, pómulos mandan). */
export const R2_DIAMANTE_FULL = 0.75
export const R2_DIAMANTE_END = 0.88

/**
 * Triangular: frente angosta respecto de los pómulos (el complemento de que
 * la mandíbula sea la más ancha). Rango un poco más angosto que diamante
 * porque acá alcanza con que la mandíbula gane, no hace falta que los
 * pómulos sean el punto más ancho de toda la cara.
 */
export const R2_TRIANGULAR_FULL = 0.72
export const R2_TRIANGULAR_END = 0.85

// ---------------------------------------------------------------------------
// R2 / R3 — relación directa frente-mandíbula (se cancela el ancho
// bicigomático: R2/R3 = anchoFrente/anchoMandibula). Estos dos son la
// traducción literal de "R2 alto RESPECTO DE R3" (corazón) y "R3 alto
// RESPECTO DE R2" (triangular) de la guía: sin este componente relacional,
// una cara ancha en general (pómulos, frente y mandíbula todos grandes)
// podría puntuar alto en ambos componentes absolutos a la vez, cosa que la
// guía no pide.
// ---------------------------------------------------------------------------

/** Corazón: frente al menos ~10% más ancha que la mandíbula empieza a contar; a partir de ~35% más ancha, membresía plena. */
export const HEART_FOREHEAD_TO_JAW_START = 1.1
export const HEART_FOREHEAD_TO_JAW_FULL = 1.35

/** Triangular: mismo criterio que corazón pero mandíbula > frente. */
export const TRIANGULAR_JAW_TO_FOREHEAD_START = 1.1
export const TRIANGULAR_JAW_TO_FOREHEAD_FULL = 1.35

// ---------------------------------------------------------------------------
// R4 — ángulo mandibular en el gonion, en grados
// ---------------------------------------------------------------------------
//
// La guía de esta fase solo menciona R4 para redonda ("ángulo suave/
// redondeado, obtuso") y cuadrada ("ángulo marcado, más cercano a 90°"), así
// que es la única fuente usada acá para esas dos formas; el resto de las
// formas no usa R4 para no inventar un criterio que la guía no pide.
// Recordar que R4, tal como lo calcula `metrics.ts`, ya es en sí mismo una
// aproximación (ver el comentario de `mandibularAngleDeg`): estos umbrales
// heredan esa incertidumbre y hay que recalibrar ambos juntos con fotos
// reales.

/** Cuadrada: ángulo marcado. Plena por debajo de 115°, cae a 0 en 130°. */
export const R4_CUADRADA_FULL = 115
export const R4_CUADRADA_END = 130

/** Redonda: ángulo obtuso/suave. Empieza a contar en 125°, plena desde 140°. */
export const R4_REDONDA_START = 125
export const R4_REDONDA_FULL = 140
