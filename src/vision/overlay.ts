// Dibuja el overlay de debug del face mesh sobre un canvas 2D ya con la foto
// pintada. Toca DOM (CanvasRenderingContext2D) a propósito: es parte de la
// capa de presentación, no de vision/quality.ts.

import type { LandmarkPoint } from '../types'
import { DEBUG_HIGHLIGHT_GROUPS } from './landmarkIndices'

/** Dibuja los 478 puntos del mesh en chiquito, más los índices clave resaltados. */
export function drawLandmarksOverlay(
  ctx: CanvasRenderingContext2D,
  landmarks: readonly LandmarkPoint[],
  width: number,
  height: number,
): void {
  ctx.save()

  // Los 478 puntos, chiquitos, para ver la malla completa.
  ctx.fillStyle = 'rgba(163, 230, 53, 0.8)' // lima, alto contraste sobre piel
  for (const point of landmarks) {
    const x = point.x * width
    const y = point.y * height
    ctx.beginPath()
    ctx.arc(x, y, 1.4, 0, Math.PI * 2)
    ctx.fill()
  }

  // Índices clave (sección 7.5), resaltados para poder validarlos a ojo.
  for (const group of DEBUG_HIGHLIGHT_GROUPS) {
    ctx.fillStyle = group.color
    for (const index of group.indices) {
      const point = landmarks[index]
      if (!point) continue
      const x = point.x * width
      const y = point.y * height
      ctx.beginPath()
      ctx.arc(x, y, 4.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  ctx.restore()
}
