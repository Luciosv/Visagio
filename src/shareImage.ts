// Generación de la ficha compartible como PNG y disparo de la Web Share API
// (segunda mitad de la Fase 5, sección 2.2 de CLAUDE.md). Este módulo SÍ toca
// el DOM (canvas, `Image`, `Blob`, `navigator.share`) a propósito, por eso no
// vive en `engine/` ni en `vision/` (sección 17: "vision/ y engine/ con
// funciones puras y testeables... nada de DOM ahí adentro") — mismo criterio
// que ya usa `vision/imageProcessing.ts` para separar lo puro de lo que
// necesita canvas real.
//
// El contenido de texto de la ficha (qué dice, no cómo se dibuja) vive en
// `engine/shareCard.ts`, que sí es puro y tiene sus tests ahí. Acá solo se
// dibuja ese contenido y se arma el archivo final.

import type { ShareCardContent } from './engine/shareCard'

/** Tamaño de la ficha: vertical, tipo tarjeta/story, para verse completa sin achicarse demasiado en un chat de WhatsApp (sección 2.2). */
export const SHARE_CARD_WIDTH = 1080
export const SHARE_CARD_HEIGHT = 1350

const PADDING = 64
const PANEL_INNER_PADDING = 32
// Paleta A — "Barbería" (carbón + latón), mismos hex que `src/styles/theme.css`
// (`--color-app`, `--color-surface`, `--color-ink`, `--color-ink-muted`,
// `--color-accent`). El canvas no puede leer variables CSS, así que quedan
// hardcodeados acá: si se cambia la paleta en `theme.css`, actualizar también
// estas cuatro líneas.
const CARD_BG = '#17140f'
const PANEL_BG = '#211b12'
const TEXT_PRIMARY = '#f5efe4'
const TEXT_SECONDARY = '#b8ae9c'
const ACCENT = '#c8952f'

// Display (Oswald) para el título del corte, body (Inter) para el resto —
// mismo par tipográfico que `--font-display`/`--font-body` en `theme.css`.
// `loadCardFonts` se asegura de que estén cargadas antes de dibujar; si por
// algo fallara la carga, el navegador cae solo a `system-ui` al no encontrar
// la familia declarada primero.
const TITLE_FONT_FAMILY = '"Oswald Variable", "Oswald", system-ui, sans-serif'
const BODY_FONT_FAMILY = '"Inter Variable", "Inter", system-ui, sans-serif'
const TITLE_FONT_PX = 64
const LABEL_FONT = `600 28px ${BODY_FONT_FAMILY}`
const BODY_FONT = `400 32px ${BODY_FONT_FAMILY}`
const BODY_LINE_HEIGHT = 44
const TITLE_ROW_HEIGHT = 52
/** Proporción de cada fila de texto donde se apoya la línea de base (evita que el texto de una fila se corte contra el techo/piso de su propia fila, sin tener que medir la métrica real de la fuente). */
const BASELINE_RATIO = 0.72

/** Ancho disponible adentro de un panel (sección 3 del encargo: "priorizá que sea legible y prolijo", no que el texto se salga del cartel). */
const PANEL_CONTENT_WIDTH = SHARE_CARD_WIDTH - PADDING * 2 - PANEL_INNER_PADDING * 2

const IMAGE_SIZE = 480
/** Aire entre la imagen y el marco redondeado que la envuelve, a cada lado. */
const IMAGE_BORDER_PAD = 24
/** Alto del "marco" con esquinas redondeadas alrededor de la imagen: la imagen más su borde de aire arriba y abajo. */
const IMAGE_BLOCK_HEIGHT = IMAGE_SIZE + IMAGE_BORDER_PAD * 2
const IMAGE_TO_TITLE_GAP = 72
const TITLE_TO_ACCENT_GAP = 44
const ACCENT_HEIGHT = 6
const ACCENT_TO_PANEL_GAP = 50
/** Alto reservado al pie para la marca de la barbería (sección 2.2: es el último ítem, chico, no protagonista), medido desde donde termina el bloque de contenido principal hasta el borde inferior del cartel. Ya sin la ficha llevando spec técnica, el bloque principal es más corto — centrarlo dentro del espacio libre (arriba de este pie) es lo que evita el hueco vacío a mitad de cartel. */
const FOOTER_RESERVED_HEIGHT = 140

/**
 * Dibuja la ficha compartible en un canvas y lo convierte a PNG. No hace
 * ninguna llamada a `navigator.share` acá: eso queda en el handler del botón
 * (`App.tsx`), para no interponer trabajo entre el click del barbero y el
 * `share()` y no perder la activación transitoria del usuario (sección 2.2).
 */
export async function renderShareCardPng(content: ShareCardContent): Promise<Blob> {
  // El canvas dibuja con la fuente que esté cargada en `document.fonts` EN
  // ESE MOMENTO: si Oswald/Inter todavía no terminaron de bajar, `fillText`
  // cae en el fallback de la pila (`system-ui`) sin avisar. Esperar acá antes
  // de dibujar nada evita fichas con la tipografía equivocada.
  await loadCardFonts()

  const canvas = document.createElement('canvas')
  canvas.width = SHARE_CARD_WIDTH
  canvas.height = SHARE_CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo crear el lienzo para la ficha.')

  ctx.fillStyle = CARD_BG
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT)

  // Medir ANTES de dibujar nada: el título achicado y el panel envuelto
  // determinan el alto real del bloque de contenido (imagen + título + acento
  // + panel), y ese alto es lo que hace falta para centrarlo verticalmente en
  // el espacio libre arriba del pie con la marca. Sin el panel de spec (ya
  // sacado de la ficha, ver Fase F) el bloque quedó bastante más corto que el
  // cartel de 1350px, así que arrancarlo siempre en `PADDING` dejaba un hueco
  // vacío grande antes de la marca; centrarlo evita eso.
  const titleFontPx = fitSingleLineFontSize(ctx, content.nombreCorte, SHARE_CARD_WIDTH - PADDING * 2, TITLE_FONT_PX)
  ctx.font = BODY_FONT
  const wrappedInfoLines = [
    ...wrapText(ctx, content.mantenimiento, PANEL_CONTENT_WIDTH),
    ...wrapText(ctx, content.peinado, PANEL_CONTENT_WIDTH),
  ]
  const panelHeight = PANEL_INNER_PADDING * 2 + wrappedInfoLines.length * BODY_LINE_HEIGHT
  const contentHeight =
    IMAGE_BLOCK_HEIGHT +
    IMAGE_TO_TITLE_GAP +
    titleFontPx +
    TITLE_TO_ACCENT_GAP +
    ACCENT_HEIGHT +
    ACCENT_TO_PANEL_GAP +
    panelHeight
  const availableHeight = SHARE_CARD_HEIGHT - PADDING - FOOTER_RESERVED_HEIGHT
  // `cursorY` es donde arranca la IMAGEN (no el marco: el marco sobresale
  // `IMAGE_BORDER_PAD` por encima). Como `contentHeight` mide el bloque
  // completo desde el borde superior del marco, hay que sumar ese mismo
  // `IMAGE_BORDER_PAD` acá para que el reparto de aire arriba/abajo quede
  // simétrico — sin este ajuste, el marco quedaba 24px más arriba de lo que
  // le tocaba y el hueco de abajo (antes de la marca) salía visiblemente más
  // grande que el de arriba.
  // No arrancar antes de `PADDING + IMAGE_BORDER_PAD`: si algún día el
  // contenido crece (nombre de corte larguísimo que igual no baja de
  // `MIN_FONT_PX`, panel con muchas líneas), se prioriza no pisar el borde
  // superior del cartel por sobre quedar perfectamente centrado.
  let cursorY = Math.max(
    PADDING + IMAGE_BORDER_PAD,
    PADDING + IMAGE_BORDER_PAD + (availableHeight - contentHeight) / 2,
  )

  // Imagen de maniquí, centrada (mismo placeholder que ya se usa en la card y
  // el detalle — es mismo-origen, así que no tainted el canvas).
  const image = await loadImage(content.imagen)
  const imageX = (SHARE_CARD_WIDTH - IMAGE_SIZE) / 2
  drawRoundedRect(
    ctx,
    imageX - IMAGE_BORDER_PAD,
    cursorY - IMAGE_BORDER_PAD,
    IMAGE_SIZE + IMAGE_BORDER_PAD * 2,
    IMAGE_SIZE + IMAGE_BORDER_PAD * 2,
    28,
    PANEL_BG,
  )
  ctx.drawImage(image, imageX, cursorY, IMAGE_SIZE, IMAGE_SIZE)
  cursorY += IMAGE_SIZE + IMAGE_BORDER_PAD + IMAGE_TO_TITLE_GAP

  // Nombre del corte, grande y centrado, en la fuente display (Oswald: la
  // misma que usa `.font-display` en el resto de la UI). Si no entra en una
  // sola línea con el ancho disponible, se achica hasta que entre (nombres
  // cortos de la sección 8 andan bien a 64px, pero no hay que asumirlo para
  // siempre).
  ctx.fillStyle = TEXT_PRIMARY
  ctx.textAlign = 'center'
  ctx.font = `700 ${titleFontPx}px ${TITLE_FONT_FAMILY}`
  ctx.fillText(content.nombreCorte, SHARE_CARD_WIDTH / 2, cursorY + titleFontPx)
  cursorY += titleFontPx + TITLE_TO_ACCENT_GAP

  // Línea de acento debajo del título.
  ctx.fillStyle = ACCENT
  ctx.fillRect(SHARE_CARD_WIDTH / 2 - 40, cursorY, 80, ACCENT_HEIGHT)
  cursorY += ACCENT_HEIGHT + ACCENT_TO_PANEL_GAP

  ctx.textAlign = 'left'

  // Panel único de mantenimiento + producto/peinado (sección 2.2: "cada
  // cuánto volver" y "producto y cuánto tarda en peinarse"). Ya no hay panel
  // de spec técnica: esa es lenguaje del barbero y vive en el Detalle de la
  // app, no en la ficha que ve el cliente (CLAUDE.md 2.2, decisión
  // revisada — ver Fase F).
  cursorY = drawTextPanel(ctx, cursorY, null, wrappedInfoLines)

  // Marca de la barbería, al pie, chica (sección 2.2: "marca de la
  // barbería" es el último ítem de la lista, no el protagonista). Posición
  // fija respecto del borde inferior, independiente de dónde termine el
  // bloque centrado de arriba.
  if (content.nombreBarberia.trim().length > 0) {
    ctx.textAlign = 'center'
    ctx.font = LABEL_FONT
    ctx.fillStyle = TEXT_SECONDARY
    ctx.fillText(content.nombreBarberia, SHARE_CARD_WIDTH / 2, SHARE_CARD_HEIGHT - PADDING / 2)
  }

  return canvasToPngBlob(canvas)
}

/**
 * Se asegura de que Oswald (título) e Inter (cuerpo/labels) estén listas para
 * `fillText` antes de dibujar. `document.fonts.ready` cubre el caso general;
 * el `load` puntual del peso/tamaño que realmente se usa fuerza la descarga
 * si todavía no se había pedido esa variante (ej. primera ficha de la sesión,
 * antes de que el resto de la UI la haya disparado). Si el navegador no
 * soporta `document.fonts` (muy viejo) o la carga falla, no se rompe: el
 * `ctx.font` ya trae `system-ui` como fallback en la pila.
 */
async function loadCardFonts(): Promise<void> {
  if (!('fonts' in document)) return
  try {
    await Promise.all([
      document.fonts.load(`700 ${TITLE_FONT_PX}px ${TITLE_FONT_FAMILY}`),
      document.fonts.load(BODY_FONT),
      document.fonts.load(LABEL_FONT),
    ])
    await document.fonts.ready
  } catch {
    // Sin bloquear la ficha por esto: peor caso, se dibuja con el fallback.
  }
}

/**
 * Dibuja un panel redondeado con un título opcional en mayúscula y una lista
 * de líneas ya envueltas (`wrapText`), devuelve el `y` donde termina el
 * panel para encadenar el siguiente. El alto sale de la cantidad de líneas,
 * no de un número fijo: por eso hace falta llamar a `wrapText` ANTES, con el
 * mismo `ctx.font` que va a usarse acá adentro para el cuerpo.
 */
function drawTextPanel(
  ctx: CanvasRenderingContext2D,
  y: number,
  title: string | null,
  lines: readonly string[],
): number {
  // Cada fila (el título, si hay, y cada línea de cuerpo) reserva su alto
  // completo de arriba a abajo; la línea de base se apoya a `BASELINE_RATIO`
  // de esa altura. Así el panel entero sale de sumar alturas de fila, sin
  // ajustes a mano ni superposición entre el título y la primera línea.
  const titleRowHeight = title ? TITLE_ROW_HEIGHT : 0
  const panelHeight = PANEL_INNER_PADDING * 2 + titleRowHeight + lines.length * BODY_LINE_HEIGHT
  drawRoundedRect(ctx, PADDING, y, SHARE_CARD_WIDTH - PADDING * 2, panelHeight, 20, PANEL_BG)

  let rowTop = y + PANEL_INNER_PADDING
  const textX = PADDING + PANEL_INNER_PADDING

  if (title) {
    ctx.font = LABEL_FONT
    ctx.fillStyle = TEXT_SECONDARY
    ctx.fillText(title, textX, rowTop + titleRowHeight * BASELINE_RATIO)
    rowTop += titleRowHeight
  }

  ctx.font = BODY_FONT
  ctx.fillStyle = TEXT_PRIMARY
  for (const line of lines) {
    ctx.fillText(line, textX, rowTop + BODY_LINE_HEIGHT * BASELINE_RATIO)
    rowTop += BODY_LINE_HEIGHT
  }

  return y + panelHeight
}

/**
 * Envuelve `text` en tantas líneas como haga falta para que ninguna supere
 * `maxWidth` con la fuente ya seteada en `ctx` (llamar con el `ctx.font`
 * correcto ANTES). Corte por palabra, no por carácter: es texto de barbería
 * en español, no hace falta partir palabras.
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`
    if (current.length > 0 && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current.length > 0) lines.push(current)

  return lines
}

/** Tamaño de fuente más grande (hasta `maxFontPx`) con el que `text` entra en una sola línea de `maxWidth`. Nombres largos de corte se achican en vez de desbordar el cartel. */
function fitSingleLineFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxFontPx: number,
): number {
  const MIN_FONT_PX = 36
  for (let fontPx = maxFontPx; fontPx > MIN_FONT_PX; fontPx -= 4) {
    ctx.font = `700 ${fontPx}px ${TITLE_FONT_FAMILY}`
    if (ctx.measureText(text).width <= maxWidth) return fontPx
  }
  return MIN_FONT_PX
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string,
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
  ctx.fillStyle = fillStyle
  ctx.fill()
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('No se pudo cargar la imagen del corte para la ficha.'))
    image.src = src
  })
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('No se pudo generar la imagen de la ficha.'))
    }, 'image/png')
  })
}

/** `navigator.canShare`/`share` con archivos, sin depender de que el lib.dom.d.ts instalado ya tipe `files` en `ShareData` (algunas versiones no lo incluyen). */
interface NavigatorWithFileShare {
  canShare?: (data: { files: readonly File[] }) => boolean
  share?: (data: { files: readonly File[]; title?: string }) => Promise<void>
}

/**
 * Intenta compartir el PNG con la Web Share API (código base exacto de la
 * sección 2.2). Chequea `canShare({ files })`, no `share` a secas, tal como
 * lo aclara la spec. Devuelve `'compartido'` si `navigator.share` se disparó,
 * o `'sin_soporte'` si el navegador no soporta compartir archivos — en ese
 * caso el llamador (`App.tsx`) muestra el fallback de descarga.
 *
 * IMPORTANTE: llamar esto directo desde el handler de un click, sin awaits
 * largos antes (más allá de generar el propio blob), para no perder la
 * activación transitoria del usuario que pide la Web Share API.
 */
export async function shareCardPng(blob: Blob): Promise<'compartido' | 'sin_soporte'> {
  const file = new File([blob], 'corte.png', { type: 'image/png' })
  const nav = navigator as Navigator & NavigatorWithFileShare

  if (nav.canShare?.({ files: [file] }) && nav.share) {
    await nav.share({ files: [file], title: 'Tu corte' })
    return 'compartido'
  }
  return 'sin_soporte'
}
