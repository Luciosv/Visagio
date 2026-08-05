// Utilidades de canvas para el pipeline de captura (7.1 de CLAUDE.md). Esta
// capa SÍ toca el DOM (a diferencia de quality.ts): decodificar el archivo,
// redimensionar, rotar para corregir roll, y recortar la región facial en
// escala de grises para medir nitidez.

import type { NormalizedBoundingBox } from '../types'

/** Lado más largo al que se reduce la foto antes de procesarla (7.1). */
export const MAX_IMAGE_SIDE_PX = 1024

/** Decodifica un `File` de imagen a un `HTMLImageElement` ya cargado. */
export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen.'))
    }
    image.src = url
  })
}

/**
 * Dibuja la imagen en un canvas nuevo, reducida como máximo a
 * `MAX_IMAGE_SIDE_PX` en el lado más largo (no se agranda si ya es más chica).
 */
export function drawResized(
  image: HTMLImageElement,
  maxSide: number = MAX_IMAGE_SIDE_PX,
): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = get2dContext(canvas)
  ctx.drawImage(image, 0, 0, width, height)
  return canvas
}

/**
 * Rota el contenido de `source` `degrees` grados (sentido horario positivo,
 * convención estándar de canvas) sobre un canvas nuevo dimensionado para que
 * la imagen rotada entre completa, sin recortar las esquinas.
 */
export function rotateCanvas(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  const radians = (degrees * Math.PI) / 180
  const sin = Math.abs(Math.sin(radians))
  const cos = Math.abs(Math.cos(radians))
  const width = source.width * cos + source.height * sin
  const height = source.width * sin + source.height * cos

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width)
  canvas.height = Math.round(height)
  const ctx = get2dContext(canvas)
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(radians)
  ctx.drawImage(source, -source.width / 2, -source.height / 2)
  return canvas
}

/**
 * Extrae la región del bounding box (normalizado [0,1], con un margen
 * proporcional) como buffer de intensidades en escala de grises, para
 * calcular nitidez (`laplacianVariance` en quality.ts).
 */
export function extractGrayscaleRegion(
  canvas: HTMLCanvasElement,
  bbox: NormalizedBoundingBox,
  marginFraction = 0.05,
): { data: Float64Array; width: number; height: number } {
  const marginX = (bbox.maxX - bbox.minX) * marginFraction
  const marginY = (bbox.maxY - bbox.minY) * marginFraction

  const minX = Math.max(0, Math.floor((bbox.minX - marginX) * canvas.width))
  const minY = Math.max(0, Math.floor((bbox.minY - marginY) * canvas.height))
  const maxX = Math.min(canvas.width, Math.ceil((bbox.maxX + marginX) * canvas.width))
  const maxY = Math.min(canvas.height, Math.ceil((bbox.maxY + marginY) * canvas.height))

  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)

  const ctx = get2dContext(canvas)
  const imageData = ctx.getImageData(minX, minY, width, height)
  const gray = new Float64Array(width * height)
  for (let i = 0; i < gray.length; i++) {
    const r = imageData.data[i * 4]
    const g = imageData.data[i * 4 + 1]
    const b = imageData.data[i * 4 + 2]
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b
  }

  return { data: gray, width, height }
}

function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('No se pudo obtener contexto 2D de canvas.')
  }
  return ctx
}
