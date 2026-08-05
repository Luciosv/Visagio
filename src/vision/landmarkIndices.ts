// Índices del face mesh de MediaPipe (478 puntos) que vamos a necesitar para
// medir. Son los de partida que trae la sección 7.5 de CLAUDE.md.
//
// OJO: son un punto de partida tomado de referencias públicas de la topología
// de FaceMesh/FaceLandmarker, no de una validación propia contra caras
// reales. La Fase 1 existe justamente para eso: el overlay de debug los
// dibuja resaltados para poder chequearlos a ojo antes de construir métricas
// encima (Fase 2). Si alguno cae visiblemente mal, corregir acá antes de
// seguir.

export const TOTAL_FACE_LANDMARKS = 478

/** Mentón. */
export const LANDMARK_CHIN = 152

/** Ancho bicigomático (pómulo a pómulo). */
export const LANDMARK_BIZYGOMATIC_LEFT = 234
export const LANDMARK_BIZYGOMATIC_RIGHT = 454

/** Gonion (ángulo de la mandíbula). */
export const LANDMARK_GONION_LEFT = 172
export const LANDMARK_GONION_RIGHT = 397

/**
 * Ancho de frente. Hay tres pares candidatos según qué tan arriba de la
 * frente se quiera medir; se listan los tres porque el doc no cierra cuál
 * usar y conviene decidirlo mirando fotos reales (Fase 2, al construir R2).
 */
export const LANDMARK_FOREHEAD_WIDTH_LEFT = 54
export const LANDMARK_FOREHEAD_WIDTH_RIGHT = 284
export const LANDMARK_FOREHEAD_WIDTH_LEFT_ALT = 103
export const LANDMARK_FOREHEAD_WIDTH_RIGHT_ALT = 332
export const LANDMARK_FOREHEAD_WIDTH_LEFT_ALT2 = 21
export const LANDMARK_FOREHEAD_WIDTH_RIGHT_ALT2 = 251

/** Canto externo de los ojos. */
export const LANDMARK_EYE_OUTER_CORNER_LEFT = 33
export const LANDMARK_EYE_OUTER_CORNER_RIGHT = 263

/** Centro del iris (requiere el submodelo de refinamiento de iris, incluido en FaceLandmarker). */
export const LANDMARK_IRIS_CENTER_LEFT = 468
export const LANDMARK_IRIS_CENTER_RIGHT = 473

/**
 * Borde superior de la malla en la frente. Pendiente: NO es el nacimiento
 * real del pelo (el triquion). MediaPipe no lo modela. Se usa como posición
 * INICIAL del handle arrastrable de la Fase 2 (sección 7.4 de CLAUDE.md); el
 * barbero lo corrige a mano y el valor real usado para medir es el corregido.
 */
export const LANDMARK_HAIRLINE_APPROX = 10

/**
 * Punto alto/arco de cada ceja. OJO: este índice NO está en la lista de
 * partida de la sección 7.5 de CLAUDE.md — esa sección no define un punto de
 * cejas. Es una SUPOSICIÓN propia de la Fase 2, necesaria para calcular R5
 * (altura de frente) y R6 (tercios faciales), tomada de referencias públicas
 * de la topología de FaceMesh/FaceLandmarker (el punto más alto del arco de
 * cada ceja). VALIDAR VISUALMENTE contra el overlay de debug con caras reales
 * antes de confiar en R5/R6: si cae en la pestaña o muy arriba de la ceja,
 * hay que corregir este índice.
 */
export const LANDMARK_EYEBROW_LEFT = 105
export const LANDMARK_EYEBROW_RIGHT = 334

/**
 * Base de la nariz (subnasal: debajo del tabique, arriba del labio superior).
 * Tampoco está en la sección 7.5 — es otra SUPOSICIÓN de la Fase 2, necesaria
 * para R6 (tercios faciales: frente/nariz/mentón). Tomado de referencias
 * públicas de la topología de FaceMesh como el punto habitual de "base de
 * nariz". VALIDAR VISUALMENTE antes de confiar en R6.
 */
export const LANDMARK_NOSE_BASE = 2

/**
 * Puntos clave a resaltar en el overlay de debug, agrupados para pintarlos
 * con un color distinto por grupo y así poder validarlos de un vistazo.
 */
export const DEBUG_HIGHLIGHT_GROUPS: ReadonlyArray<{
  readonly label: string
  readonly color: string
  readonly indices: readonly number[]
}> = [
  { label: 'Mentón', color: '#ef4444', indices: [LANDMARK_CHIN] },
  {
    label: 'Bicigomático',
    color: '#facc15',
    indices: [LANDMARK_BIZYGOMATIC_LEFT, LANDMARK_BIZYGOMATIC_RIGHT],
  },
  {
    label: 'Gonion',
    color: '#fb923c',
    indices: [LANDMARK_GONION_LEFT, LANDMARK_GONION_RIGHT],
  },
  {
    label: 'Ancho de frente',
    color: '#38bdf8',
    indices: [LANDMARK_FOREHEAD_WIDTH_LEFT, LANDMARK_FOREHEAD_WIDTH_RIGHT],
  },
  {
    label: 'Canto externo de ojos',
    color: '#e879f9',
    indices: [LANDMARK_EYE_OUTER_CORNER_LEFT, LANDMARK_EYE_OUTER_CORNER_RIGHT],
  },
  {
    label: 'Centro de iris',
    color: '#ffffff',
    indices: [LANDMARK_IRIS_CENTER_LEFT, LANDMARK_IRIS_CENTER_RIGHT],
  },
  {
    label: 'Nacimiento de pelo (aprox., pendiente ajuste manual)',
    color: '#4ade80',
    indices: [LANDMARK_HAIRLINE_APPROX],
  },
  {
    label: 'Cejas (supuesto Fase 2, validar)',
    color: '#c084fc',
    indices: [LANDMARK_EYEBROW_LEFT, LANDMARK_EYEBROW_RIGHT],
  },
  {
    label: 'Base de nariz (supuesto Fase 2, validar)',
    color: '#f472b6',
    indices: [LANDMARK_NOSE_BASE],
  },
]
