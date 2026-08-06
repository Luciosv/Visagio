// Flujo completo de "cliente nuevo" (sección 10 de CLAUDE.md): foto → gate
// de calidad → ajuste de nacimiento → forma + override → form de 5 taps →
// RESULTADOS → detalle → compartir/"este hice". Hasta la Fase 6a esto ERA
// toda la app (`App.tsx` arrancaba directo acá, sin pantalla de inicio); se
// movió a su propio componente para poder montarlo detrás de un botón
// "Cliente nuevo" en `screens/HomeScreen.tsx`, sin tocarle la lógica interna.
//
// Fase 6b: `ResultsScreen`/`CutDetailScreen`/`BarberForm` se extrajeron a
// módulos propios (`screens/ResultsScreen.tsx`, `components/BarberForm.tsx`)
// para que `screens/BuscarClienteScreen.tsx` (flujo de "cliente que vuelve")
// los reuse sin duplicar la UI — este archivo ahora solo arma el pipeline de
// visión + form y le pasa el resultado a `ResultsScreen` con
// `guardarFichaTarget: { kind: 'nueva' }`, que es el único comportamiento de
// "Este hice" que le corresponde a un cliente nuevo (pide alias y crea la
// `ClienteFicha`). La cola de feedback y los chips de 👎 siguen sin
// implementar a propósito: son Fase 7, no esta.

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type {
  BarberInput,
  ClientFlag,
  CutLength,
  CutRecommendation,
  FaceRatios,
  FaceShape,
  FacialTransformationMatrix,
  FaceShapeClassification,
  HairDensity,
  HairTexture,
  LandmarkPoint,
  LargoActualArriba,
  Point2D,
  PoseAngles,
  QualityResult,
} from '../types'
import { FACE_SHAPES } from '../types'
import { getFaceLandmarker } from '../vision/faceLandmarker'
import { applyFaceShapeOverride, classifyFaceShape, explainFaceShape, FACE_SHAPE_LABELS } from '../vision/faceShape'
import {
  drawResized,
  extractGrayscaleRegion,
  loadImageFromFile,
  rotateCanvas,
} from '../vision/imageProcessing'
import {
  boundingBoxHeightFraction,
  computeBoundingBox,
  decomposePose,
  evaluateQuality,
  laplacianVariance,
  needsRollCorrection,
} from '../vision/quality'
import { computeFaceRatios } from '../vision/metrics'
import { drawLandmarksOverlay } from '../vision/overlay'
import { DEBUG_HIGHLIGHT_GROUPS, LANDMARK_HAIRLINE_APPROX } from '../vision/landmarkIndices'
import { publishDebugSnapshot } from '../vision/debugHook'
import { recommendCuts } from '../engine/recommend'
import { useCuts } from '../hooks/useCuts'
import { useAppConfig } from '../hooks/useAppConfig'
import { BarberForm } from '../components/BarberForm'
import { VersionFooter } from '../components/ui'
import { ResultsScreen, type ResultsContext } from './ResultsScreen'

declare global {
  interface Window {
    /** Gancho de testing DEV-only, ver el `useEffect` que lo define dentro de `NuevoClienteScreen`. */
    __visagioInjectRatiosForTesting?: (ratios: FaceRatios) => void
  }
}

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

interface NuevoClienteScreenProps {
  /** Vuelve a INICIO (sección 10). Al desmontarse este componente todo su estado se pierde, así que no hace falta resetear nada a mano: la próxima vez que el barbero entre a "Cliente nuevo" arranca de cero. */
  readonly onExit: () => void
}

export function NuevoClienteScreen({ onExit }: NuevoClienteScreenProps) {
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

  // Clasificación de forma de cara (Fase 3, 7.6). `faceShapeSuggested` es el
  // top-1 del algoritmo, tal cual sale de `classifyFaceShape`, y nunca se
  // pisa: es la base para saber si el barbero corrigió o no (mismo patrón
  // que `hairlineSuggested`/`hairlineCorrected` de arriba). `faceShapeCorrected`
  // es la forma que queda mostrada, editable con el selector de las 7 formas.
  const [faceShapeClassification, setFaceShapeClassification] = useState<FaceShapeClassification | null>(
    null,
  )
  const [faceShapeSuggested, setFaceShapeSuggested] = useState<FaceShape | null>(null)
  const [faceShapeCorrected, setFaceShapeCorrected] = useState<FaceShape | null>(null)

  // Fase 5 — form del barbero (5 taps, 7.7 + el quinto tap nuevo de largo
  // actual). Cada respuesta arranca en `null` (menos `flags`, que arranca
  // vacío: la implantación y las restricciones son multi-selección y no
  // seleccionar ninguna es una respuesta válida) hasta que el barbero la
  // toca, así "Ver recomendaciones" puede exigir que las obligatorias estén
  // completas sin inventar un valor por defecto que no eligió nadie.
  const [textura, setTextura] = useState<HairTexture | null>(null)
  const [densidad, setDensidad] = useState<HairDensity | null>(null)
  const [flags, setFlags] = useState<readonly ClientFlag[]>([])
  const [minutosDeclarados, setMinutosDeclarados] = useState<number | null>(null)
  const [largoActualArriba, setLargoActualArriba] = useState<LargoActualArriba | null>(null)

  // `cuts.seed.json` y `config.json` (sección 6: "los datos separados del
  // código"), ambos vía hooks compartidos con `BuscarClienteScreen.tsx` (Fase
  // 6b): misma lógica de fetch en runtime, dos consumidores.
  const { cuts, cutsError } = useCuts()
  const config = useAppConfig()

  // Resultado de `recommendCuts` más el contexto que necesita `explain.ts`
  // para armar el porqué de cada card (sección 9). Se arma una sola vez al
  // tocar "Ver recomendaciones" y no se vuelve a recalcular al filtrar por
  // longitud o abrir el detalle — eso es solo UI sobre el mismo ranking.
  const [results, setResults] = useState<ResultsContext | null>(null)
  const [lengthFilter, setLengthFilter] = useState<CutLength | 'todos'>('todos')
  const [selectedRecommendation, setSelectedRecommendation] = useState<CutRecommendation | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Gancho de testing, solo en DEV (mismo criterio que `debugHook.ts`, que ya
  // anticipa este uso exacto: "un script de Playwright que arma el fixture
  // de tests"). Sortea todo el pipeline de visión (que necesita una foto real
  // con cara) para poder probar form → motor → resultados de punta a punta
  // sin depender de un dispositivo con cámara.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__visagioInjectRatiosForTesting = (testRatios: FaceRatios) => {
      setRatios(testRatios)
      const classification = classifyFaceShape(testRatios)
      setFaceShapeClassification(classification)
      setFaceShapeSuggested(classification.top1.shape)
      setFaceShapeCorrected(classification.top1.shape)
      setStage('listo')
    }
  }, [])

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
    setFaceShapeClassification(null)
    setFaceShapeSuggested(null)
    setFaceShapeCorrected(null)
    setTextura(null)
    setDensidad(null)
    setFlags([])
    setMinutosDeclarados(null)
    setLargoActualArriba(null)
    setResults(null)
    setLengthFilter('todos')
    setSelectedRecommendation(null)

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

    const classification = classifyFaceShape(computed)
    setFaceShapeClassification(classification)
    setFaceShapeSuggested(classification.top1.shape)
    setFaceShapeCorrected(classification.top1.shape)

    setStage('listo')
  }

  function handleFaceShapeOverride(shape: FaceShape) {
    setFaceShapeCorrected(shape)
  }

  function toggleFlag(flag: ClientFlag) {
    setFlags((prev) => (prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag]))
  }

  function onFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) {
      void handleFile(file)
    }
  }

  // Las 4 respuestas de un solo tap son obligatorias para poder puntuar
  // (`recommendCuts` las necesita todas); `flags` (implantación +
  // restricciones) es multi-selección y no seleccionar ninguna es válido.
  const barberInputComplete =
    textura !== null && densidad !== null && minutosDeclarados !== null && largoActualArriba !== null
  const canShowResults = barberInputComplete && cuts !== null && ratios !== null && faceShapeClassification !== null && faceShapeCorrected !== null

  function handleShowResults() {
    if (
      !canShowResults ||
      !cuts ||
      !ratios ||
      !faceShapeClassification ||
      !faceShapeCorrected ||
      textura === null ||
      densidad === null ||
      minutosDeclarados === null ||
      largoActualArriba === null
    ) {
      return
    }

    const barberInput: BarberInput = { textura, densidad, flags, minutosDeclarados, largoActualArriba }
    // El motor de recomendación siempre trabaja sobre lo que el barbero
    // CONFIRMÓ como forma de cara, no sobre la sugerencia cruda del
    // algoritmo (7.6: "un selector para pisar el resultado").
    const effectiveFaceShape = applyFaceShapeOverride(faceShapeClassification, faceShapeCorrected)
    const ranking = recommendCuts(cuts, effectiveFaceShape, barberInput)

    setResults({
      recommendations: ranking,
      faceShape: effectiveFaceShape,
      ratios,
      barberInput,
      faceShapeSuggestedTop1: faceShapeClassification.top1,
      faceShapeCorrectedShape: faceShapeCorrected,
    })
    setLengthFilter('todos')
    setSelectedRecommendation(null)
  }

  function handleBackFromResults() {
    setResults(null)
    setSelectedRecommendation(null)
  }

  const isBusy = stage === 'procesando' || stage === 'cargando-modelo'

  if (results) {
    return (
      <ResultsScreen
        results={results}
        config={config}
        lengthFilter={lengthFilter}
        onLengthFilterChange={setLengthFilter}
        selected={selectedRecommendation}
        onSelect={setSelectedRecommendation}
        onBack={handleBackFromResults}
        onExit={onExit}
        guardarFichaTarget={{ kind: 'nueva' }}
      />
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center bg-neutral-950 px-4 pb-16 pt-8 text-neutral-50">
      <div className="flex w-full max-w-sm items-center">
        <button type="button" onClick={onExit} className="min-h-14 px-2 text-sm font-semibold text-neutral-300">
          ← Inicio
        </button>
      </div>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Cliente nuevo</h1>
      <p className="mt-1 text-sm text-neutral-400">Foto, forma de cara y recomendación</p>

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

      {config.mostrarDebug && debugInfo && (
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

      {config.mostrarDebug && hairlineSuggested && hairlineCorrected && (
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

      {config.mostrarDebug && ratios && (
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

      {ratios && faceShapeClassification && faceShapeCorrected && (
        <div className="mt-4 w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-200">
          <p className="mb-1 font-semibold text-neutral-100">Forma de cara (sugerencia)</p>
          {/* Nunca una etiqueta sola con seguridad falsa (secciones 3 y 12):
              siempre se muestran las dos formas con más puntaje y su % de
              confianza, nunca solo la primera. */}
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-lg font-semibold text-lime-400">
              {FACE_SHAPE_LABELS[faceShapeClassification.top1.shape]}{' '}
              {Math.round(faceShapeClassification.top1.confidence * 100)}%
            </span>
            <span className="text-sm text-neutral-500">
              / {FACE_SHAPE_LABELS[faceShapeClassification.top2.shape]}{' '}
              {Math.round(faceShapeClassification.top2.confidence * 100)}%
            </span>
          </div>
          <p className="mt-2 text-xs text-neutral-400">
            {explainFaceShape(faceShapeClassification, ratios)}
          </p>

          <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            ¿No es esa la forma? Tocá la que le pinta más
          </p>
          <div className="flex flex-wrap gap-2">
            {FACE_SHAPES.map((shape) => {
              const selected = faceShapeCorrected === shape
              return (
                <button
                  key={shape}
                  type="button"
                  onClick={() => handleFaceShapeOverride(shape)}
                  aria-pressed={selected}
                  className={
                    'min-h-14 rounded-xl border px-4 text-sm font-semibold transition active:scale-[0.98] ' +
                    (selected
                      ? 'border-lime-400 bg-lime-400 text-neutral-950'
                      : 'border-neutral-700 bg-neutral-800 text-neutral-200')
                  }
                >
                  {FACE_SHAPE_LABELS[shape]}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {config.mostrarDebug && faceShapeClassification && faceShapeSuggested && faceShapeCorrected && (
        <div className="mt-4 w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs text-neutral-300">
          <p className="mb-2 font-semibold text-neutral-100">Forma de cara (debug)</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <dt className="text-neutral-500">Sugerida (algoritmo)</dt>
            <dd>{FACE_SHAPE_LABELS[faceShapeSuggested]}</dd>
            <dt className="text-neutral-500">Corregida por el barbero</dt>
            <dd>
              {FACE_SHAPE_LABELS[faceShapeCorrected]}
              {faceShapeCorrected !== faceShapeSuggested && ' (corregida)'}
            </dd>
          </dl>
          <p className="mb-1 mt-3 text-neutral-500">Puntaje crudo de las 7 formas</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            {faceShapeClassification.scores.map((score) => (
              <Fragment key={score.shape}>
                <dt className="text-neutral-500">{FACE_SHAPE_LABELS[score.shape]}</dt>
                <dd>
                  {(score.confidence * 100).toFixed(0)}% (raw {score.rawScore.toFixed(2)})
                </dd>
              </Fragment>
            ))}
          </dl>
          <p className="mt-2 text-neutral-500">
            Igual que con el nacimiento del pelo: si el barbero corrige acá, es
            oro puro para calibrar (2.3), pero todavía no se envía ni persiste
            (eso es Fase 7).
          </p>
        </div>
      )}

      {config.mostrarDebug && (
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
      )}

      {ratios && faceShapeClassification && faceShapeCorrected && (
        <BarberForm
          textura={textura}
          onTextura={setTextura}
          densidad={densidad}
          onDensidad={setDensidad}
          flags={flags}
          onToggleFlag={toggleFlag}
          minutosDeclarados={minutosDeclarados}
          onMinutosDeclarados={setMinutosDeclarados}
          largoActualArriba={largoActualArriba}
          onLargoActualArriba={setLargoActualArriba}
          canSubmit={canShowResults}
          onSubmit={handleShowResults}
          submitLabel={cuts === null && cutsError === null ? 'Cargando base de cortes…' : 'Ver recomendaciones'}
          cutsError={cutsError}
        />
      )}

      <VersionFooter />
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

