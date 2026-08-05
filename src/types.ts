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
