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
        {stage === 'ajuste-nacimiento' && hairlineCorrected && (
          <HairlineHandle
            position={hairlineCorrected}
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
            Arrastrá el punto verde hasta donde arranca de verdad el pelo. El
            punto 10 del mesh es solo una aproximación de la frente, no el
            nacimiento real.
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
  readonly canvas: HTMLCanvasElement | null
  readonly onChange: (point: Point2D) => void
}

/**
 * Handle arrastrable del nacimiento del pelo (7.4 de CLAUDE.md). Se posiciona
 * con `position: absolute` sobre el canvas usando porcentajes, así que sigue
 * el tamaño renderizado del canvas (que se escala por CSS, `w-full`) sin
 * tener que sincronizar tamaños a mano.
 *
 * DECISIÓN DE INTERACCIÓN a confirmar con uso real: el arrastre es LIBRE en
 * los dos ejes (x e y), no restringido al eje de simetría vertical de la
 * cara. La spec (7.4) deja abierta esa elección ("a lo largo del eje de
 * simetría... o libremente si es más simple de implementar bien"). Se eligió
 * libre por ser más simple y más tolerante a fotos donde la cara no está
 * perfectamente centrada en el punto sugerido; el riesgo es que un barbero
 * con el dedo grande lo arrastre sin querer unos píxeles hacia el costado. Si
 * en el uso real eso genera lecturas raras de R1/R5/R6, la corrección es
 * fácil: proyectar `x` de vuelta al `x` del punto sugerido antes de guardar.
 *
 * Usa Pointer Events con `setPointerCapture` (en vez de listeners en
 * `window`) para que arrastrar con el dedo funcione igual que con mouse y
 * sin perder el gesto si el dedo se sale un poco del handle.
 */
function HairlineHandle({ position, canvas, onChange }: HairlineHandleProps) {
  function updateFromClientPosition(clientX: number, clientY: number) {
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const x = clamp01((clientX - rect.left) / rect.width)
    const y = clamp01((clientY - rect.top) / rect.height)
    onChange({ x, y })
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    updateFromClientPosition(event.clientX, event.clientY)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.buttons === 0) return
    updateFromClientPosition(event.clientX, event.clientY)
  }

  return (
    <div
      role="slider"
      aria-label="Ajustar línea de nacimiento del pelo"
      aria-valuenow={Math.round(position.y * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      // Target de 56px (sección 10: "targets de 56 px mínimo, todo alcanzable
      // con un pulgar"), aunque el punto visual sea más chico.
      className="absolute z-10 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
    >
      <div className="h-6 w-6 rounded-full border-4 border-neutral-950 bg-lime-400 shadow-[0_0_0_2px_rgba(255,255,255,0.6)]" />
    </div>
  )
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export default App
