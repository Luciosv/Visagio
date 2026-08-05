// Carga y wrapper del FaceLandmarker de MediaPipe. A diferencia de
// quality.ts, este archivo SÍ toca el mundo (fetch de wasm/modelo, WebGL):
// no es "puro" a propósito, es la capa de integración.
//
// Todo self-hosted (sección 4 y 6 de CLAUDE.md): el runtime WASM sale de
// /models/wasm/ (copiado desde node_modules por scripts/copy-mediapipe-wasm.mjs
// vía postinstall) y el modelo .task sale de /models/face_landmarker.task.
// Nada se pide a storage.googleapis.com ni a ningún otro CDN en runtime.

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const WASM_BASE_PATH = '/models/wasm'
const MODEL_ASSET_PATH = '/models/face_landmarker.task'

let landmarkerPromise: Promise<FaceLandmarker> | null = null

/**
 * Devuelve la instancia (única, cacheada) del FaceLandmarker, creándola la
 * primera vez que se pide. `runningMode: "IMAGE"` porque analizamos una foto
 * fija, no video (7.2 de CLAUDE.md).
 */
export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = createFaceLandmarker().catch((error: unknown) => {
      // Si falla la creación no dejamos la promesa rota cacheada: la próxima
      // llamada reintenta desde cero.
      landmarkerPromise = null
      throw error
    })
  }
  return landmarkerPromise
}

async function createFaceLandmarker(): Promise<FaceLandmarker> {
  const wasmFileset = await FilesetResolver.forVisionTasks(WASM_BASE_PATH)

  try {
    return await FaceLandmarker.createFromOptions(wasmFileset, {
      baseOptions: {
        modelAssetPath: MODEL_ASSET_PATH,
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFacialTransformationMatrixes: true,
    })
  } catch (gpuError) {
    // No todos los navegadores/dispositivos exponen un contexto WebGL
    // utilizable para el delegate de GPU (pasa en particular en entornos de
    // test headless). Reintentamos con CPU antes de darnos por vencidos: es
    // más lento pero funciona en todos lados.
    console.warn(
      '[faceLandmarker] Falló crear el FaceLandmarker con delegate GPU, reintentando con CPU.',
      gpuError,
    )
    return FaceLandmarker.createFromOptions(wasmFileset, {
      baseOptions: {
        modelAssetPath: MODEL_ASSET_PATH,
        delegate: 'CPU',
      },
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFacialTransformationMatrixes: true,
    })
  }
}
