// Dibuja el overlay del face mesh sobre un canvas 2D ya con la foto pintada.
// Toca DOM (CanvasRenderingContext2D) a propósito: es parte de la capa de
// presentación, no de vision/quality.ts.
//
// Rediseño (Fase B), decisión de producto de CLAUDE.md 10: la malla de 478
// puntos NO es debug, queda SIEMPRE visible (da sensación de "tecnología de
// análisis" frente al cliente). Los grupos de puntos de colores
// (`DEBUG_HIGHLIGHT_GROUPS`) sí son ayuda de validación de landmarks para el
// desarrollador, y su leyenda ya vivía detrás de `mostrarDebug` — antes de
// esta fase los puntos se dibujaban igual, quedando colores sueltos sin
// explicación sobre la cara del cliente. Ahora también se ocultan sin el flag.

import type { LandmarkPoint } from '../types'
import { DEBUG_HIGHLIGHT_GROUPS } from './landmarkIndices'

/** Dibuja los 478 puntos del mesh en chiquito, más (si `mostrarDebug`) los índices clave resaltados. */
export function drawLandmarksOverlay(
  ctx: CanvasRenderingContext2D,
  landmarks: readonly LandmarkPoint[],
  width: number,
  height: number,
  mostrarDebug: boolean,
): void {
  ctx.save()

  // Los 478 puntos del mesh, para leer la malla completa como "tecnología de
  // análisis" y no como salpicadura de color. Crema brillante (--color-ink de
  // theme.css) con un halo oscuro finito alrededor de cada punto: el relleno
  // claro los hace visibles sobre piel oscura y el halo los recorta sobre piel
  // clara, así se leen prolijos sobre cualquier tono (antes eran crema muy
  // tenue a radio 1.0 y prácticamente no se veían). Para ajustar visibilidad,
  // tocar sólo el radio y la opacidad de acá.
  ctx.fillStyle = 'rgba(245, 239, 228, 0.9)'
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
  ctx.lineWidth = 0.75
  for (const point of landmarks) {
    const x = point.x * width
    const y = point.y * height
    ctx.beginPath()
    ctx.arc(x, y, 1.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  // Índices clave (sección 7.5): ayuda de validación de landmarks para el
  // desarrollador, no para el barbero. Detrás de `mostrarDebug`, igual que su
  // leyenda (ver referencia de colores en `NuevoClienteScreen.tsx`).
  if (mostrarDebug) {
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
  }

  ctx.restore()
}
