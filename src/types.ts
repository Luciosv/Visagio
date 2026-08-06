// Fuente de verdad de los tipos del proyecto (ver sección 17 de CLAUDE.md:
// "nada de `any`, los tipos viven en src/types.ts").
//
// Esta fase (Fase 1 — Visión) solo necesita los tipos de landmarks, matriz de
// transformación facial y el resultado del gate de calidad. Los tipos de
// forma de cara, cortes, ficha de cliente, etc. se agregan en fases
// posteriores, no antes.

/**
 * Un punto del face mesh en coordenadas normalizadas [0, 1] respecto del
 * ancho/alto de la imagen procesada. Es un subconjunto deliberado de
 * `NormalizedLandmark` de `@mediapipe/tasks-vision` (sin `visibility`, que no
 * usamos): así `vision/quality.ts` no depende del tipo de la librería y se
 * puede testear con fixtures planos.
 */
export interface LandmarkPoint {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * Matriz 4x4 de transformación facial, tal como la entrega
 * `FaceLandmarkerResult.facialTransformationMatrixes[i]`: 16 valores
 * flotantes en `data`, en orden **column-major** (confirmado en la
 * documentación de MediaPipe: la matriz se arma pensada para usarse
 * directamente como matriz de modelo en WebGL).
 */
export interface FacialTransformationMatrix {
  readonly rows: number
  readonly columns: number
  readonly data: readonly number[]
}

/** Ángulos de pose de la cabeza, en grados. */
export interface PoseAngles {
  readonly yawDeg: number
  readonly pitchDeg: number
  readonly rollDeg: number
}

/** Bounding box de la cara en coordenadas normalizadas [0, 1]. */
export interface NormalizedBoundingBox {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

/** Códigos de motivo de rechazo del gate de calidad (7.3 de CLAUDE.md). */
export type QualityIssueCode =
  | 'sin_cara'
  | 'multiples_caras'
  | 'pose_yaw'
  | 'pose_pitch'
  | 'tamano'
  | 'nitidez'

/** Entrada del gate de calidad: todo ya medido, la función solo evalúa. */
export interface QualityInput {
  /** Cantidad de caras detectadas en la imagen. */
  readonly faceCount: number
  /** Yaw en grados, ya decompuesto de la matriz de transformación. */
  readonly yawDeg: number
  /** Pitch en grados, ya decompuesto de la matriz de transformación. */
  readonly pitchDeg: number
  /** Fracción [0, 1] del alto de la imagen que ocupa el bounding box facial. */
  readonly boundingBoxHeightFraction: number
  /** Varianza del laplaciano sobre la región facial (medida de nitidez). */
  readonly sharpness: number
}

export interface QualityRejection {
  readonly ok: false
  readonly code: QualityIssueCode
  /** Mensaje concreto y accionable en español rioplatense, para mostrar tal cual. */
  readonly message: string
}

export interface QualityAccepted {
  readonly ok: true
}

export type QualityResult = QualityRejection | QualityAccepted

/**
 * Punto 2D normalizado [0,1] respecto del ancho/alto de la imagen procesada.
 * A diferencia de `LandmarkPoint`, no tiene `z` ni viene necesariamente de un
 * índice del face mesh: es la posición del handle de línea de nacimiento
 * (7.4 de CLAUDE.md), que el barbero puede arrastrar a cualquier posición.
 */
export interface Point2D {
  readonly x: number
  readonly y: number
}

/**
 * Proporción de cada tercio facial clásico respecto del largo total
 * (nacimiento → mentón). Suman ~1 entre los tres. Ver R6 en la sección 7.5.
 */
export interface FacialThirds {
  readonly frente: number
  readonly nariz: number
  readonly menton: number
}

/**
 * Razones adimensionales R1-R6 de la sección 7.5 de CLAUDE.md. `r4` es el
 * único que no es una razón sino un ángulo, en grados.
 */
export interface FaceRatios {
  readonly r1: number
  readonly r2: number
  readonly r3: number
  readonly r4: number
  readonly r5: number
  readonly r6: FacialThirds
}

/**
 * Las siete formas de cara clásicas del visagismo (7.6 y 12.2 de CLAUDE.md:
 * "distintas escuelas usan 4, 5, 6, 7 o 9 categorías. Se eligen 7 y se
 * documenta"). Identificadores sin tilde a propósito (uso como clave de
 * mapas/objetos); la tilde va solo en las etiquetas de UI.
 */
export const FACE_SHAPES = [
  'ovalada',
  'redonda',
  'cuadrada',
  'alargada',
  'corazon',
  'diamante',
  'triangular',
] as const

export type FaceShape = (typeof FACE_SHAPES)[number]

/** Puntaje difuso de una forma puntual, ya normalizado como fracción del total (7.6: "top-2 normalizado"). */
export interface FaceShapeScore {
  readonly shape: FaceShape
  /** Puntaje crudo de la regla difusa, antes de normalizar. Sirve para debug. */
  readonly rawScore: number
  /** `rawScore` como fracción del total de las 7 formas. Suma no siempre 1 entre las dos primeras: es fracción del total de las 7, no una renormalización entre las top-2 (de ahí que el ejemplo de 7.6 dé "61% / 34%", que suman 95%, no 100%). */
  readonly confidence: number
}

/**
 * Resultado completo de `classifyFaceShape`: las 7 formas puntuadas y
 * ordenadas de mayor a menor confianza, más accesos directos a las top-2 que
 * es lo único que se muestra en pantalla (sección 3 y 12: nunca una sola
 * etiqueta con seguridad falsa).
 */
export interface FaceShapeClassification {
  readonly scores: readonly FaceShapeScore[]
  readonly top1: FaceShapeScore
  readonly top2: FaceShapeScore
}
