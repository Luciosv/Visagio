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

// ---------------------------------------------------------------------------
// Fase 4 — motor de recomendación (secciones 8 y 9 de CLAUDE.md).
//
// Los tipos de acá abajo (`HairTexture`, `HairDensity`, `ClientFlag`,
// `BarberInput`) describen la SALIDA del form de 4 taps de la sección 7.7,
// que todavía no tiene UI (eso es Fase 5): se definen ahora porque
// `engine/recommend.ts` los necesita como input tipado. Cuando se construya
// el form real, tiene que producir exactamente esta forma de datos.
// ---------------------------------------------------------------------------

/** Textura de pelo, primer tap del form (7.7.1). */
export const HAIR_TEXTURES = ['lacio', 'ondulado', 'rulo', 'muy_rizado'] as const
export type HairTexture = (typeof HAIR_TEXTURES)[number]

/** Densidad de pelo, segundo tap del form (7.7.2). */
export const HAIR_DENSITIES = ['fino', 'medio', 'grueso'] as const
export type HairDensity = (typeof HAIR_DENSITIES)[number]

/**
 * Flags de implantación y de restricción, taps 3 y 4 del form (7.7.3 y
 * 7.7.4). Se modelan como un único tipo/array porque `Cut.favorece` y
 * `Cut.penaliza` (sección 8) hacen match contra cualquiera de los dos por
 * igual: a un corte le puede favorecer o penalizar tanto un rasgo de
 * implantación ("remolino_coronilla") como una restricción del cliente
 * ("orejas_prominentes"), y el motor de la sección 9 no necesita distinguir
 * el origen para calcular `bonus(favorece ∩ flags)` / `penalización(...)`.
 * Es el mismo array plano que aparece como `form.flags` en el JSON de
 * telemetría de la sección 2.3.
 *
 * Set elegido como punto de partida (no viene fijado por la spec, que solo
 * da los cuatro grupos de la 7.7 como ejemplos: "remolinos · nuca ·
 * entradas · coronilla" para implantación y "orejas prominentes · cuello
 * corto · gorra o casco · trabajo formal" para restricciones) — revisar con
 * criterio de barbero antes de calibrar `cuts.seed.json` en Fase 7:
 *  - `remolino_coronilla`: remolino en la coronilla, condiciona cortes muy
 *    cortos y texturizados arriba.
 *  - `entradas`: entradas/retroceso en las sienes.
 *  - `nuca_dificil`: nacimiento de nuca irregular (partido, muy bajo, etc.).
 *  - `coronilla_rala`: pelo ralo en la coronilla.
 *  - `orejas_prominentes`: restricción del cliente, condiciona cortes que
 *    dejan la oreja muy expuesta.
 *  - `cuello_corto`: restricción del cliente.
 *  - `gorra_o_casco`: usa gorra o casco a diario, condiciona cortes que
 *    dependen de peinado con volumen.
 *  - `trabajo_formal`: entorno laboral formal, condiciona cortes muy
 *    alternativos o de largo no convencional.
 */
export const CLIENT_FLAGS = [
  'remolino_coronilla',
  'entradas',
  'nuca_dificil',
  'coronilla_rala',
  'orejas_prominentes',
  'cuello_corto',
  'gorra_o_casco',
  'trabajo_formal',
] as const
export type ClientFlag = (typeof CLIENT_FLAGS)[number]

/**
 * Largo actual del pelo arriba de la cabeza, en 4 buckets de centímetros.
 * QUINTO tap del form, agregado en Fase 5 sobre la spec original de 7.7 (esa
 * sección solo definía 4 taps) — decisión tomada con el usuario en la sesión
 * de esta fase para poder implementar "expectativas alcanzables" (sección 9:
 * un corte puede puntuar alto por forma/textura/densidad pero no ser
 * ejecutable HOY si al cliente todavía no le creció el pelo suficiente).
 * Se modela como bucket, no como centímetro exacto, porque el barbero no
 * mide con precisión y no hace falta: alcanza con saber en qué franja
 * general está. Los rangos en cm de cada bucket viven en
 * `engine/largoActualArribaThresholds.ts` (mismo patrón que
 * `qualityThresholds.ts`).
 */
export const LARGO_ACTUAL_ARRIBA_VALUES = ['rapado_maquina', 'corto_tijera', 'media_melena', 'largo'] as const
export type LargoActualArriba = (typeof LARGO_ACTUAL_ARRIBA_VALUES)[number]

/**
 * Salida completa del form de 5 taps (7.7 + el quinto tap nuevo de arriba).
 * `minutosDeclarados` es el cuarto tap ("minutos que está dispuesto a
 * peinarse (0 / 2 / 5+)"): se tipa como `number` en vez de una unión literal
 * porque "5+" no es un valor discreto único, es el piso de un rango abierto;
 * la UI de Fase 5 decide qué chips ofrece (por ejemplo 0 / 2 / 5) pero el
 * motor solo necesita el número.
 */
export interface BarberInput {
  readonly textura: HairTexture
  readonly densidad: HairDensity
  readonly flags: readonly ClientFlag[]
  readonly minutosDeclarados: number
  readonly largoActualArriba: LargoActualArriba
}

/** Longitud general del corte, para el toggle de la sección 9 (se filtra recién en Fase 5). */
export const CUT_LENGTHS = ['corto', 'medio', 'largo'] as const
export type CutLength = (typeof CUT_LENGTHS)[number]

/** Especificación técnica breve de un corte (sección 8), la spec concreta que el barbero le da al cliente. */
export interface CutSpec {
  readonly costados: string
  readonly arriba: string
  readonly nuca: string
  readonly contorno: string
}

/**
 * Rutas a las dos vistas de maniquí de un corte (sección 15: "mismo ángulo
 * (3/4 y posterior)"). En esta fase apuntan a placeholders genéricos en
 * `public/cuts/` (ver README de esa carpeta): las imágenes reales se generan
 * más adelante, sin que este tipo cambie.
 */
export interface CutImages {
  readonly tresCuartos: string
  readonly posterior: string
}

/**
 * Un corte de la base de `cuts.seed.json` (sección 8). Puntajes de afinidad
 * en escala 0-5 (0 = no aplica/desaconsejado, 5 = ideal). `verificado: false`
 * en todo `cuts.seed.json` hasta que el barbero corrija estos datos en Fase 7
 * (sección 8: "la primera sesión con el barbero es corregirlos uno por uno").
 */
export interface Cut {
  readonly id: string
  readonly nombre: string
  readonly longitud: CutLength
  readonly afinidadForma: Record<FaceShape, number>
  readonly afinidadTextura: Record<HairTexture, number>
  readonly afinidadDensidad: Record<HairDensity, number>
  readonly favorece: readonly ClientFlag[]
  readonly penaliza: readonly ClientFlag[]
  readonly spec: CutSpec
  readonly pasos: readonly string[]
  readonly cuidados: readonly string[]
  readonly mantenimientoSemanas: number
  readonly minutosDePeinado: number
  /** 1 (más simple) a 5 (más exigente para ejecutar). */
  readonly dificultad: number
  readonly tiempoEjecucionMin: number
  readonly verificado: boolean
  /**
   * Producto sugerido para el peinado diario de este corte (sección 2.2: la
   * ficha compartible lleva "producto y cuánto tarda en peinarse"). Igual
   * criterio que el resto de `cuts.seed.json`: conocimiento público de
   * barbería, no de taller — cae bajo el mismo `verificado: false` del corte,
   * no tiene su propio flag.
   */
  readonly producto: string
  readonly imagenes: CutImages
  /**
   * Mínimo de centímetros de largo ARRIBA que necesita este corte para
   * ejecutarse razonablemente (Fase 5, sección 9: "expectativas
   * alcanzables"). Se compara contra el bucket de `LargoActualArriba` que
   * declaró el barbero: si el cliente todavía no llega, el corte no se
   * descarta del ranking, se marca como `caminoEnVariosCortes` en
   * `CutRecommendation`. Estimado de arranque por corte, sin verificar (ver
   * `verificado` arriba y el README de `public/cuts/`).
   */
  readonly largoMinimoArribaCm: number
}

/**
 * Desglose del score de un corte (sección 9), para que `explain.ts` pueda
 * citar el término concreto que más pesó sin recalcular nada.
 */
export interface CutScoreBreakdown {
  /** w1·afinidadForma[top1]·conf1 */
  readonly formaTop1: number
  /** w2·afinidadForma[top2]·conf2 */
  readonly formaTop2: number
  /** w3·afinidadTextura[textura] */
  readonly textura: number
  /** w4·afinidadDensidad[densidad] */
  readonly densidad: number
  /** w5·bonus(favorece ∩ flags) */
  readonly bonusFavorece: number
  /** w6·penalización(penaliza ∩ flags), ya en positivo (se resta en el total). */
  readonly penalizacionPenaliza: number
  /** w7·max(0, minutosDePeinado - minutosDeclarados), ya en positivo (se resta en el total). */
  readonly penalizacionPeinado: number
  /** Flags del cliente que matchearon `cut.favorece`, para citarlos en `explain.ts`. */
  readonly favoreceCoincidentes: readonly ClientFlag[]
  /** Flags del cliente que matchearon `cut.penaliza`, para citarlos en `explain.ts`. */
  readonly penalizaCoincidentes: readonly ClientFlag[]
  /** Minutos de peinado que exceden lo declarado (0 si no excede). */
  readonly minutosExceso: number
}

/** Un corte puntuado por `recommendCuts`, con el desglose para poder explicarlo. */
export interface CutRecommendation {
  readonly cut: Cut
  readonly score: number
  readonly breakdown: CutScoreBreakdown
  /**
   * `true` cuando `cut.largoMinimoArribaCm` supera el máximo del bucket de
   * `largoActualArriba` que declaró el barbero (sección 9: "expectativas
   * alcanzables"). El corte SIGUE en el ranking con su score normal — esto
   * no lo descarta, solo le pide a la UI que lo muestre como "camino en 2-3
   * cortes" en vez de una recomendación directa para hoy.
   */
  readonly caminoEnVariosCortes: boolean
}

/**
 * Feature flags de `public/data/config.json` (sección 6 de CLAUDE.md: "un
 * `config.json` chico al lado de `cuts.json` con banderas booleanas. Permite
 * prender o apagar una pantalla sin redeploy"). Se pide con `fetch` en
 * runtime, igual que `cuts.seed.json`, nunca se importa al bundle.
 */
export interface AppConfig {
  /**
   * Muestra los paneles de debug (ratios crudos de pose/nitidez, calibración
   * de nacimiento, ratios R1-R6 y puntaje crudo de forma de cara). `false`
   * por defecto: son números pensados para el desarrollador, no para el
   * barbero (sección 10: "el modo debug detrás de un flag").
   */
  readonly mostrarDebug: boolean
  /**
   * Marca de la barbería, para el pie de la ficha compartible (sección 2.2:
   * "marca de la barbería"). Placeholder por ahora: todavía no existe una
   * pantalla de ajustes donde el barbero la cargue (fuera de alcance de esta
   * fase, sección 11 — no construir esa pantalla sin que se pida). Cuando
   * exista, este valor pasa a salir de ahí en vez de `config.json`.
   */
  readonly nombreBarberia: string
}
