import { useRef, useState, type ChangeEvent } from 'react'
import type { FacialTransformationMatrix, LandmarkPoint, PoseAngles, QualityResult } from './types'
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
import { drawLandmarksOverlay } from './vision/overlay'
import { DEBUG_HIGHLIGHT_GROUPS } from './vision/landmarkIndices'
import { publishDebugSnapshot } from './vision/debugHook'

type Stage = 'idle' | 'cargando-modelo' | 'procesando' | 'listo' | 'error'

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
      setStage('listo')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Ocurrió un error inesperado.')
      setStage('error')
    }
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
        Fase 1 — visión (overlay de debug)
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

      <div className="mt-6 w-full max-w-sm">
        <canvas
          ref={canvasRef}
          className="w-full rounded-xl border border-neutral-800 bg-neutral-900"
        />
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

export default App
