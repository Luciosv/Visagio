// Gancho de depuración, solo en build de desarrollo: expone la última
// detección en `window` para poder inspeccionarla desde afuera (por ejemplo,
// un script de Playwright que arma el fixture de tests a partir de una
// detección real). No se incluye en el bundle de producción.

import type { FacialTransformationMatrix, LandmarkPoint } from '../types'

export interface VisagioDebugSnapshot {
  readonly landmarks: readonly LandmarkPoint[]
  readonly matrix: FacialTransformationMatrix | null
  readonly faceCount: number
}

declare global {
  interface Window {
    __visagioLastDetection?: VisagioDebugSnapshot
  }
}

export function publishDebugSnapshot(snapshot: VisagioDebugSnapshot): void {
  if (import.meta.env.DEV) {
    window.__visagioLastDetection = snapshot
  }
}
