import { useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type {
  FaceRatios,
  FacialTransformationMatrix,
  LandmarkPoint,
  Point2D,
  PoseAngles,
  QualityResult,
} from './types'
import { getFaceLandmarker } from './vision/faceLandmarker'
import {
  drawResized,
  extractGrayscaleRegion,
  loadImageFromFile,
  rotateCanvas,
} from './vision/imageProcessing'
import {
  boundingBoxHeightFraction,
  computeBoundingBox,
  decomposePose,
  evaluateQuality,
  laplacianVariance,
  needsRollCorrection,
} from './vision/quality'
import { computeFaceRatios } from './vision/metrics'
import { drawLandmarksOverlay } from './vision/overlay'
import { DEBUG_HIGHLIGHT_GROUPS, LANDMARK_HAIRLINE_APPROX } from './vision/landmarkIndices'
import { publishDebugSnapshot } from './vision/debugHook'

// 'ajuste-nacimiento': la foto pasó el gate de calidad y se está esperando
// que el barbero confirme (o corrija) el handle de nacimiento del pelo antes
// de calcular los ratios (7.4 de CLAUDE.md). Solo se llega acá si la foto
// pasó el gate; si no pasó, se va directo a 'listo' mostrando el rechazo.
type Stage = 'idle' | 'cargando-modelo' | 'procesando' | 'ajuste-nacimiento' | 'listo' | 'error'

interface DebugInfo extends PoseAngles {
  readonly faceCount: number
  readonly rollCorrectedDeg: number | null
  readonly boundingBoxHeightFraction: number
  readonly sharpness: number
  readonly landmarkCount: number
}

function App() {
  const [stage, setStage] = useState<Stage>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [quality, setQuality] = useState<QualityResult | null>(null)
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)

  // Ajuste manual de línea de nacimiento (7.4). `hairlineSuggested` es el
  // landmark 10 tal cual lo entrega MediaPipe, nunca se pisa: es la base del
  // delta de calibración. `hairlineCorrected` es lo que el barbero deja
  // arrastrando el handle (arranca igual al sugerido). `metricsSource` guarda
  // los landmarks + tamaño de imagen de la detección vigente, necesarios
  // recién al confirmar, para no recalcular nada de vuelta.
  const [hairlineSuggested, setHairlineSuggested] = useState<Point2D | null>(null)
  const [hairlineCorrected, setHairlineCorrected] = useState<Point2D | null>(null)
  const [metricsSource, setMetricsSource] = useState<{
    readonly landmarks: readonly LandmarkPoint[]
    readonly imageWidth: number
    readonly imageHeight: number
  } | null>(null)
  const [ratios, setRatios] = useState<FaceRatios | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function drawToDisplayCanvas(source: HTMLCanvasElement, landmarks: readonly LandmarkPoint[]) {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = source.width
    canvas.height = source.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(source, 0, 0)
    drawLandmarksOverlay(ctx, landmarks, source.width, source.height)
  }

  async function handleFile(file: File) {
    setStage('procesando')
    setErrorMessage(null)
    setQuality(null)
    setDebugInfo(null)
    setHairlineSuggested(null)
    setHairlineCorrected(null)
    setMetricsSource(null)
    setRatios(null)

    try {
      const image = await loadImageFromFile(file)
      let workingCanvas = drawResized(image)

      setStage('cargando-modelo')
      const landmarker = await getFaceLandmarker()
      setStage('procesando')

      let result = landmarker.detect(workingCanvas)
      let faceCount = result.faceLandmarks.length
      let pose: PoseAngles = { yawDeg: 0, pitchDeg: 0, rollDeg: 0 }
      let rollCorrectedDeg: number | null = null

      if (faceCount === 1) {
        pose = decomposePose(result.facialTransformationMatrixes[0])

        if (needsRollCorrection(pose.rollDeg)) {
          // El roll no rechaza: se corrige rotando y se vuelve a detectar
          // sobre la imagen ya nivelada (7.3 de CLAUDE.md). El signo se
          // calibró empíricamente rotando una foto de prueba un ángulo
          // conocido y confirmando que este sentido cancela la inclinación
          // (ver reporte de la Fase 1); no se dedujo de la convención de
          // ejes de la matriz, que no está 100% confirmada.
          workingCanvas = rotateCanvas(workingCanvas, pose.rollDeg)
          result = landmarker.detect(workingCanvas)
          faceCount = result.faceLandmarks.length
          rollCorrectedDeg = pose.rollDeg
          if (faceCount === 1) {
            pose = decomposePose(result.facialTransformationMatrixes[0])
          }
        }
      }

      const landmarks: LandmarkPoint[] = result.faceLandmarks[0] ?? []
      const matrix: FacialTransformationMatrix | null = result.facialTransformationMatrixes[0] ?? null

      let heightFraction = 0
      let sharpness = 0
      if (faceCount === 1) {
        const bbox = computeBoundingBox(landmarks)
        heightFraction = boundingBoxHeightFraction(bbox)
        const region = extractGrayscaleRegion(workingCanvas, bbox)
        sharpness = laplacianVariance(region.data, region.width, region.height)
      }

      const qualityResult = evaluateQuality({
        faceCount,
        yawDeg: pose.yawDeg,
        pitchDeg: pose.pitchDeg,
        boundingBoxHeightFraction: heightFraction,
        sharpness,
      })

      drawToDisplayCanvas(workingCanvas, landmarks)
      publishDebugSnapshot({ landmarks, matrix, faceCount })

      setDebugInfo({
        faceCount,
        yawDeg: pose.yawDeg,
        pitchDeg: pose.pitchDeg,
        rollDeg: pose.rollDeg,
        rollCorrectedDeg,
        boundingBoxHeightFraction: heightFraction,
        sharpness,
        landmarkCount: landmarks.length,
      })
      setQuality(qualityResult)

      if (qualityResult.ok) {
        // La foto pasó el gate: recién ahora tiene sentido pedirle al
        // barbero que confirme el nacimiento del pelo (7.4). El sugerido
        // arranca en el landmark 10 (aproximado, ver landmarkIndices.ts) y
        // el corregido arranca igual, hasta que lo arrastre.
        const suggested: Point2D = {
          x: landmarks[LANDMARK_HAIRLINE_APPROX].x,
          y: landmarks[LANDMARK_HAIRLINE_APPROX].y,
        }
        setHairlineSuggested(suggested)
        setHairlineCorrected(suggested)
        setMetricsSource({ landmarks, imageWidth: workingCanvas.width, imageHeight: workingCanvas.height })
        setStage('ajuste-nacimiento')
      } else {
        setStage('listo')
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Ocurrió un error inesperado.')
      setStage('error')
    }
  }

  function handleHairlineDrag(point: Point2D) {
    setHairlineCorrected(point)
  }

  function handleConfirmHairline() {
    if (!hairlineCorrected || !metricsSource) return
    const computed = computeFaceRatios({
      landmarks: metricsSource.landmarks,
      hairlinePoint: hairlineCorrected,
      imageWidth: metricsSource.imageWidth,
      imageHeight: metricsSource.imageHeight,
    })
    setRatios(computed)
    setStage('listo')
  }

  function onFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) {
      void handleFile(file)
    }
  }

  const isBusy = stage === 'procesando' || stage === 'cargando-modelo'

  return (
    <div className="flex min-h-svh flex-col items-center bg-neutral-950 px-4 pb-16 pt-8 text-neutral-50">
      <h1 className="text-3xl font-semibold tracking-tight">Visagio</h1>
      <p className="mt-1 text-sm text-neutral-400">Asistente de visagismo para barbería</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-amber-400">
        Fase 2 — métricas (ajuste de nacimiento + ratios)
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFileInputChange}
      />

      <button
        type="button"
        disabled={isBusy}
        onClick={() => fileInputRef.current?.click()}
        className="mt-6 min-h-14 w-full max-w-sm rounded-xl bg-lime-400 px-6 text-lg font-semibold text-neutral-950 transition active:scale-[0.98] disabled:opacity-50"
      >
        {stage === 'cargando-modelo'
          ? 'Cargando modelo…'
          : stage === 'procesando'
            ? 'Procesando…'
            : 'Elegir foto'}
      </button>

      {errorMessage && (
        <div className="mt-4 w-full max-w-sm rounded-xl border border-red-500 bg-red-950 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </div>
      )}

      <div className="relative mt-6 w-full max-w-sm">
        <canvas
          ref={canvasRef}
          className="w-full rounded-xl border border-neutral-800 bg-neutral-900"
        />
        {stage === 'ajuste-nacimiento' && hairlineCorrected && hairlineSuggested && (
          <HairlineHandle
            position={hairlineCorrected}
            lockedX={hairlineSuggested.x}
            canvas={canvasRef.current}
            onChange={handleHairlineDrag}
          />
        )}
      </div>

      {quality && (
        <div
          className={
            'mt-4 w-full max-w-sm rounded-xl border px-4 py-3 text-sm ' +
            (quality.ok
              ? 'border-lime-500 bg-lime-950 text-lime-200'
              : 'border-amber-500 bg-amber-950 text-amber-200')
          }
        >
          {quality.ok ? 'Calidad OK: la foto pasó el gate.' : quality.message}
        </div>
      )}

      {stage === 'ajuste-nacimiento' && (
        <>
          <div className="mt-4 w-full max-w-sm rounded-xl border border-sky-500 bg-sky-950 px-4 py-3 text-sm text-sky-200">
            Tocá cerca de la línea punteada y arrastrá hasta donde arranca de
            verdad el pelo. Al tocar, la línea aparece un poco arriba de tu
            dedo a propósito, para que no la tapes. El punto 10 del mesh es
            solo una aproximación de la frente, no el nacimiento real.
          </div>
          <button
            type="button"
            onClick={handleConfirmHairline}
            className="mt-4 min-h-14 w-full max-w-sm rounded-xl bg-lime-400 px-6 text-lg font-semibold text-neutral-950 transition active:scale-[0.98]"
          >
            Confirmar y ver ratios
          </button>
        </>
      )}

      {debugInfo && (
        <div className="mt-4 w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs text-neutral-300">
          <p className="mb-2 font-semibold text-neutral-100">Ratios crudos (debug)</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <dt className="text-neutral-500">Caras detectadas</dt>
            <dd>{debugInfo.faceCount}</dd>
            <dt className="text-neutral-500">Landmarks</dt>
            <dd>{debugInfo.landmarkCount}</dd>
            <dt className="text-neutral-500">Yaw</dt>
            <dd>{debugInfo.yawDeg.toFixed(1)}°</dd>
            <dt className="text-neutral-500">Pitch</dt>
            <dd>{debugInfo.pitchDeg.toFixed(1)}°</dd>
            <dt className="text-neutral-500">Roll</dt>
            <dd>
              {debugInfo.rollDeg.toFixed(1)}°
              {debugInfo.rollCorrectedDeg !== null && ' (corregido)'}
            </dd>
            <dt className="text-neutral-500">Alto de cara / imagen</dt>
            <dd>{(debugInfo.boundingBoxHeightFraction * 100).toFixed(0)}%</dd>
            <dt className="text-neutral-500">Nitidez (var. laplaciano)</dt>
            <dd>{debugInfo.sharpness.toFixed(0)}</dd>
          </dl>
        </div>
      )}

      {hairlineSuggested && hairlineCorrected && (
        <div className="mt-4 w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs text-neutral-300">
          <p className="mb-2 font-semibold text-neutral-100">
            Calibración de nacimiento (debug)
          </p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <dt className="text-neutral-500">Sugerido (landmark 10)</dt>
            <dd>
              {hairlineSuggested.x.toFixed(3)}, {hairlineSuggested.y.toFixed(3)}
            </dd>
            <dt className="text-neutral-500">Corregido por el barbero</dt>
            <dd>
              {hairlineCorrected.x.toFixed(3)}, {hairlineCorrected.y.toFixed(3)}
            </dd>
            <dt className="text-neutral-500">Delta vertical (calibración)</dt>
            <dd>{(hairlineCorrected.y - hairlineSuggested.y).toFixed(3)}</dd>
          </dl>
          <p className="mt-2 text-neutral-500">
            Este delta es el dato de calibración de la sección 2.3 (todavía no
            se envía a ningún lado: eso es Fase 7).
          </p>
        </div>
      )}

      {ratios && (
        <div className="mt-4 w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-200">
          <p className="mb-2 font-semibold text-neutral-100">Ratios faciales (R1-R6)</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <dt className="text-neutral-500">R1 · Largo / ancho cara</dt>
            <dd>{ratios.r1.toFixed(2)}</dd>
            <dt className="text-neutral-500">R2 · Frente / ancho cara</dt>
            <dd>{ratios.r2.toFixed(2)}</dd>
            <dt className="text-neutral-500">R3 · Mandíbula / ancho cara</dt>
            <dd>{ratios.r3.toFixed(2)}</dd>
            <dt className="text-neutral-500">R4 · Ángulo mandibular</dt>
            <dd>{ratios.r4.toFixed(0)}°</dd>
            <dt className="text-neutral-500">R5 · Altura de frente</dt>
            <dd>{ratios.r5.toFixed(2)}</dd>
          </dl>
          <p className="mb-1 mt-3 text-neutral-500">R6 · Tercios faciales</p>
          <dl className="grid grid-cols-3 gap-x-2 text-center">
            <div>
              <dt className="text-neutral-500">Frente</dt>
              <dd>{(ratios.r6.frente * 100).toFixed(0)}%</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Nariz</dt>
              <dd>{(ratios.r6.nariz * 100).toFixed(0)}%</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Mentón</dt>
              <dd>{(ratios.r6.menton * 100).toFixed(0)}%</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="mt-4 w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs text-neutral-400">
        <p className="mb-2 font-semibold text-neutral-100">Referencia de colores del overlay</p>
        <ul className="space-y-1">
          <li className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-lime-400" />
            Malla completa (478 puntos)
          </li>
          {DEBUG_HIGHLIGHT_GROUPS.map((group) => (
            <li key={group.label} className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full border border-black/40"
                style={{ backgroundColor: group.color }}
              />
              {group.label}
            </li>
          ))}
        </ul>
      </div>

      <footer className="fixed inset-x-0 bottom-0 py-3 text-center text-xs text-neutral-500">
        v{__APP_VERSION__}
      </footer>
    </div>
  )
}

interface HairlineHandleProps {
  /** Posición normalizada [0,1] relativa al canvas (no al viewport). */
  readonly position: Point2D
  /**
   * X fijo del punto sugerido (landmark 10). El ajuste de nacimiento es
   * puramente vertical: fijar el x evita que un dedo grande lo arrastre sin
   * querer hacia el costado y ensucie R1/R5/R6 (reportado con uso real de la
   * Fase 2).
   */
  readonly lockedX: number
  readonly canvas: HTMLCanvasElement | null
  readonly onChange: (point: Point2D) => void
}

/** Cuánto más arriba del dedo se dibuja la línea, para que nunca quede tapada. */
const HAIRLINE_DRAG_OFFSET_PX = 80

/**
 * Alto de la franja "agarrable" alrededor de la línea (no toda la foto): así
 * tocar lejos de la línea (por ejemplo para hacer scroll hacia el botón de
 * confirmar más abajo) no dispara un arrastre por accidente. Reportado con
 * uso real: cubrir toda la foto como superficie de arrastre competía con el
 * scroll de la página.
 */
const HAIRLINE_GRAB_ZONE_HEIGHT_PX = 72

/**
 * Ajuste del nacimiento del pelo (7.4 de CLAUDE.md), como una línea punteada
 * horizontal en vez de un punto: es más fácil alinearla a ojo contra el pelo
 * real que un punto chico, y tapa menos la foto.
 *
 * Dos decisiones para el problema de "el dedo tapa lo que estás moviendo":
 * 1. Solo se puede arrastrar tocando CERCA de la línea (franja de
 *    `HAIRLINE_GRAB_ZONE_HEIGHT_PX`, centrada en su posición actual), no en
 *    cualquier parte de la foto — el resto de la foto queda libre para hacer
 *    scroll normal.
 * 2. Una vez que se empieza a arrastrar, la línea se dibuja
 *    `HAIRLINE_DRAG_OFFSET_PX` más arriba de donde está el dedo realmente.
 *    Se mueve 1 a 1 con el dedo (mismo patrón que el cursor de texto de iOS
 *    al mantener presionado), así que se sigue sintiendo conectada al gesto,
 *    pero nunca queda tapada.
 *
 * Usa Pointer Events con `setPointerCapture` para que el arrastre con el dedo
 * no se corte si se sale un poco de la franja.
 */
function HairlineHandle({ position, lockedX, canvas, onChange }: HairlineHandleProps) {
  function updateFromClientY(clientY: number) {
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.height === 0) return
    const y = clamp01((clientY - HAIRLINE_DRAG_OFFSET_PX - rect.top) / rect.height)
    onChange({ x: lockedX, y })
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    updateFromClientY(event.clientY)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.buttons === 0) return
    updateFromClientY(event.clientY)
  }

  return (
    <>
      <div
        role="slider"
        aria-label="Ajustar línea de nacimiento del pelo"
        aria-valuenow={Math.round(position.y * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        className="absolute inset-x-0 z-10 -translate-y-1/2 cursor-grab touch-none active:cursor-grabbing"
        style={{ top: `${position.y * 100}%`, height: `${HAIRLINE_GRAB_ZONE_HEIGHT_PX}px` }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-lime-400"
        style={{ top: `${position.y * 100}%` }}
      />
    </>
  )
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export default App
