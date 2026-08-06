// "Buscar cliente" (Fase 6b, secciones 5 y 10 de CLAUDE.md): la ruta
// PRINCIPAL de uso real ("diseñar la pantalla de inicio alrededor de 'buscar
// cliente', no de 'sacar foto'"). El análisis morfológico de un cliente se
// hace una sola vez (`NuevoClienteScreen.tsx`); acá se abre lo que ya quedó
// guardado y se ofrecen las dos rutas de "cliente que vuelve" (sección 5):
//
//   Buscar → Ficha → "Repetir el último"  → mismo corte, misma spec,
//                                            directo al detalle (~instantáneo)
//                  → "Ajustar"            → form de 5 taps de nuevo (textura,
//                                            densidad, restricciones y largo
//                                            actual pueden haber cambiado),
//                                            reusando la morfología YA
//                                            GUARDADA (ratios + forma) sin
//                                            volver a clasificar → Resultados
//
// "Este hice" en las dos rutas usa `agregarHistorial`, nunca `crearFicha`
// (esa ficha ya existe) — se lo indica a `ResultsScreen`/`CutDetailScreen` con
// `guardarFichaTarget: { kind: 'existente', ... }` (ver `ResultsScreen.tsx`).
//
// Decisión de diseño para "Ajustar": la ficha solo guarda el TOP-1 de forma
// (`MorfologiaCliente.formaSugerida`, no la clasificación completa de las 7
// formas) más la corrección del barbero si la hubo. Se reconstruye la
// clasificación completa con `classifyFaceShape(ratios)` — función pura, los
// mismos ratios siempre dan la misma clasificación, así que esto NO es
// "volver a clasificar" en el sentido de pedirle algo nuevo al barbero, es
// solo recalcular lo mismo de antes — y se le vuelve a aplicar la corrección
// guardada (o el top1 si no la hubo) con `applyFaceShapeOverride`. El form de
// 5 taps arranca con los flags de implantación/restricción PRE-CARGADOS
// desde `morfologia.flags` (son datos físicos del cliente, con buena chance
// de seguir vigentes) y, desde la Fase G del rediseño UI/UX, también con
// textura/densidad/minutos/largo actual PRE-CARGADOS desde
// `ficha.ultimoForm` (el form que se confirmó la última vez que se tocó
// "Este hice" con este cliente) — son justamente los que más chance tienen
// de haber cambiado, así que quedan editables, no fijos: el barbero confirma
// o ajusta en un tap en vez de repetir 4 taps desde cero. Fichas creadas
// antes de esa fase (esquema v2, sin `ultimoForm`) arrancan esos cuatro
// campos en blanco, igual que se comportaba todo el form antes.

import { useEffect, useState } from 'react'
import type {
  BarberInput,
  ClienteFicha,
  ClientFlag,
  Cut,
  CutLength,
  CutRecommendation,
  CutScoreBreakdown,
  HairDensity,
  HairTexture,
  LargoActualArriba,
} from '../types'
import { listarFichas } from '../data/db'
import { applyFaceShapeOverride, classifyFaceShape, FACE_SHAPE_LABELS } from '../vision/faceShape'
import { recommendCuts } from '../engine/recommend'
import { useCuts } from '../hooks/useCuts'
import { useAppConfig } from '../hooks/useAppConfig'
import { BarberForm, FLAG_CHIP_LABELS } from '../components/BarberForm'
import { VersionFooter } from '../components/ui'
import { CutDetailScreen, ResultsScreen, type ResultsContext } from './ResultsScreen'

interface BuscarClienteScreenProps {
  readonly onExit: () => void
}

/** Sub-pantalla activa una vez que se abrió una ficha (ver comentario de arriba del archivo). */
type FichaView =
  | { readonly kind: 'ficha' }
  | { readonly kind: 'repitiendo'; readonly recommendation: CutRecommendation }
  | { readonly kind: 'ajustando' }
  | {
      readonly kind: 'resultados'
      readonly results: ResultsContext
      readonly lengthFilter: CutLength | 'todos'
      readonly selected: CutRecommendation | null
    }

/**
 * Desglose "vacío" para la `CutRecommendation` sintética de "Repetir el
 * último": no hay un `BarberInput` de esa visita guardado (`HistorialEntry`
 * solo guarda corte + spec, no el form completo), así que no hay ningún
 * score real que mostrar. No importa: `CutDetailScreen` no lee `score` ni
 * `breakdown`, solo `cut` y `caminoEnVariosCortes` (y este camino no pasa por
 * `CutCard`, que sí los usaría para el "porqué").
 */
const EMPTY_BREAKDOWN: CutScoreBreakdown = {
  formaTop1: 0,
  formaTop2: 0,
  textura: 0,
  densidad: 0,
  bonusFavorece: 0,
  penalizacionPenaliza: 0,
  penalizacionPeinado: 0,
  favoreceCoincidentes: [],
  penalizaCoincidentes: [],
  minutosExceso: 0,
}

export function BuscarClienteScreen({ onExit }: BuscarClienteScreenProps) {
  const [fichas, setFichas] = useState<readonly ClienteFicha[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedFicha, setSelectedFicha] = useState<ClienteFicha | null>(null)
  const [fichaView, setFichaView] = useState<FichaView>({ kind: 'ficha' })
  const [repetirError, setRepetirError] = useState<string | null>(null)

  const { cuts, cutsError } = useCuts()
  const config = useAppConfig()

  // Form de "Ajustar" (mismo widget que `NuevoClienteScreen.tsx`, ver
  // comentario de arriba del archivo sobre qué se pre-carga y qué no).
  const [textura, setTextura] = useState<HairTexture | null>(null)
  const [densidad, setDensidad] = useState<HairDensity | null>(null)
  const [flags, setFlags] = useState<readonly ClientFlag[]>([])
  const [minutosDeclarados, setMinutosDeclarados] = useState<number | null>(null)
  const [largoActualArriba, setLargoActualArriba] = useState<LargoActualArriba | null>(null)

  useEffect(() => {
    let cancelled = false
    listarFichas()
      .then((data) => {
        if (!cancelled) setFichas(data)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar las fichas.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  function toggleFlag(flag: ClientFlag) {
    setFlags((prev) => (prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag]))
  }

  function openFicha(ficha: ClienteFicha) {
    setSelectedFicha(ficha)
    setFichaView({ kind: 'ficha' })
    setRepetirError(null)
    // El form de "Ajustar" arranca con los flags guardados pre-cargados (ver
    // comentario de arriba del archivo) MÁS textura/densidad/minutos/largo
    // desde `ficha.ultimoForm` cuando existe (Fase G: fichas creadas antes
    // de esa fase no lo tienen — esquema v2 — y arrancan en blanco, igual
    // que antes).
    const ultimoForm = ficha.ultimoForm
    setTextura(ultimoForm?.textura ?? null)
    setDensidad(ultimoForm?.densidad ?? null)
    setFlags(ficha.morfologia.flags)
    setMinutosDeclarados(ultimoForm?.minutosDeclarados ?? null)
    setLargoActualArriba(ultimoForm?.largoActualArriba ?? null)
  }

  function closeFicha() {
    setSelectedFicha(null)
    setFichaView({ kind: 'ficha' })
  }

  function handleRepetir() {
    if (!selectedFicha || !cuts) return
    setRepetirError(null)
    const lastEntry = selectedFicha.historial[selectedFicha.historial.length - 1]
    const baseCut = cuts.find((c) => c.id === lastEntry.corteId)
    if (!baseCut) {
      setRepetirError('Ese corte ya no está en la base de cortes. Probá "Ajustar" para elegir de nuevo.')
      return
    }
    // Mismo corte, pero con la spec CONGELADA de esa visita (sección 5): si
    // `cuts.seed.json` cambió desde entonces, "repetir" tiene que mostrar lo
    // que de verdad se le dijo al cliente esa vez, no la spec vigente hoy.
    const cutWithHistoricalSpec: Cut = { ...baseCut, spec: lastEntry.spec }
    const recommendation: CutRecommendation = {
      cut: cutWithHistoricalSpec,
      score: 0,
      breakdown: EMPTY_BREAKDOWN,
      caminoEnVariosCortes: false,
    }
    setFichaView({ kind: 'repitiendo', recommendation })
  }

  const ajusteCompleto =
    textura !== null && densidad !== null && minutosDeclarados !== null && largoActualArriba !== null

  function handleAjustarSubmit() {
    if (!selectedFicha || !cuts || !ajusteCompleto || textura === null || densidad === null || minutosDeclarados === null || largoActualArriba === null) {
      return
    }
    const { morfologia } = selectedFicha
    // Ratios y forma YA GUARDADOS, no se vuelve a pasar por foto ni por
    // landmarks (ver comentario de arriba del archivo).
    const classification = classifyFaceShape(morfologia.ratios)
    const correctedShape = morfologia.formaCorregida ?? morfologia.formaSugerida.shape
    const effectiveFaceShape = applyFaceShapeOverride(classification, correctedShape)

    const barberInput: BarberInput = { textura, densidad, flags, minutosDeclarados, largoActualArriba }
    const ranking = recommendCuts(cuts, effectiveFaceShape, barberInput)

    const results: ResultsContext = {
      recommendations: ranking,
      faceShape: effectiveFaceShape,
      ratios: morfologia.ratios,
      barberInput,
      faceShapeSuggestedTop1: morfologia.formaSugerida,
      faceShapeCorrectedShape: correctedShape,
      // "Ajustar" reusa los ratios YA GUARDADOS de la ficha, sin pasar por
      // una foto nueva ni por el handle de nacimiento: no hay ningún ajuste
      // que reportar acá (ver comentario de `ResultsContext.ajusteLineaNacimiento`).
      ajusteLineaNacimiento: null,
    }
    setFichaView({ kind: 'resultados', results, lengthFilter: 'todos', selected: null })
  }

  // --- Resultados / detalle de un corte, reusando exactamente la misma UI
  // que "cliente nuevo" (ver comentario de arriba del archivo). ---

  if (selectedFicha && fichaView.kind === 'resultados') {
    return (
      <ResultsScreen
        results={fichaView.results}
        config={config}
        lengthFilter={fichaView.lengthFilter}
        onLengthFilterChange={(filter) => setFichaView({ ...fichaView, lengthFilter: filter })}
        selected={fichaView.selected}
        onSelect={(recommendation) => setFichaView({ ...fichaView, selected: recommendation })}
        onBack={() => setFichaView({ kind: 'ficha' })}
        onExit={onExit}
        guardarFichaTarget={{ kind: 'existente', fichaId: selectedFicha.id, alias: selectedFicha.alias }}
      />
    )
  }

  if (selectedFicha && fichaView.kind === 'repitiendo') {
    return (
      <CutDetailScreen
        recommendation={fichaView.recommendation}
        results={null}
        config={config}
        onBack={() => setFichaView({ kind: 'ficha' })}
        onExit={onExit}
        guardarFichaTarget={{ kind: 'existente', fichaId: selectedFicha.id, alias: selectedFicha.alias }}
        // "Repetir el último" no pasa por el motor de recomendación (no hay
        // `ResultsContext`, ver `results={null}` arriba): no hay ranking ni
        // form que reportar, así que tampoco hay sesión de feedback acá (ver
        // comentario de `FeedbackSesionState` en `ResultsScreen.tsx`).
        feedbackSesion={null}
      />
    )
  }

  // --- Ficha de cliente: morfología + historial + "Repetir"/"Ajustar". ---

  if (selectedFicha && fichaView.kind === 'ajustando') {
    return (
      <div className="flex min-h-svh flex-col items-center bg-app px-4 pb-16 pt-8 text-ink">
        <div className="flex w-full max-w-sm items-center">
          <button
            type="button"
            onClick={() => setFichaView({ kind: 'ficha' })}
            className="min-h-14 px-2 text-sm font-semibold text-ink-muted"
          >
            ← Volver a la ficha
          </button>
        </div>
        <h1 className="mt-2 w-full max-w-sm font-display text-2xl font-semibold text-ink">Ajustar — {selectedFicha.alias}</h1>
        <p className="mt-1 w-full max-w-sm text-sm text-ink-muted">
          Se usa la forma de cara y los ratios ya guardados. Solo hace falta confirmar lo que puede haber cambiado.
        </p>

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
          canSubmit={ajusteCompleto && cuts !== null}
          onSubmit={handleAjustarSubmit}
          submitLabel={cuts === null && cutsError === null ? 'Cargando base de cortes…' : 'Ver recomendaciones'}
          cutsError={cutsError}
        />

        <VersionFooter />
      </div>
    )
  }

  if (selectedFicha) {
    const sortedHistorial = [...selectedFicha.historial].reverse()
    const { morfologia } = selectedFicha

    return (
      <div className="flex min-h-svh flex-col items-center bg-app px-4 pb-20 pt-8 text-ink">
        <div className="flex w-full max-w-sm items-center">
          <button type="button" onClick={closeFicha} className="min-h-14 px-2 text-sm font-semibold text-ink-muted">
            ← Volver a la búsqueda
          </button>
        </div>

        <h1 className="mt-2 w-full max-w-sm font-display text-2xl font-semibold text-ink">{selectedFicha.alias}</h1>

        <div className="panel mt-4 w-full max-w-sm px-4 py-3 text-sm text-ink">
          <p className="mb-2 font-semibold text-ink">Morfología</p>
          <p>
            Forma sugerida:{' '}
            <span className="font-semibold text-accent-ink">
              {FACE_SHAPE_LABELS[morfologia.formaSugerida.shape]} ({Math.round(morfologia.formaSugerida.confidence * 100)}%)
            </span>
          </p>
          {morfologia.formaCorregida && (
            <p className="mt-1">
              Corregida por el barbero a: <span className="font-semibold text-ink">{FACE_SHAPE_LABELS[morfologia.formaCorregida]}</span>
            </p>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-muted">
            <dt className="text-ink-faint">R1 · Largo / ancho cara</dt>
            <dd>{morfologia.ratios.r1.toFixed(2)}</dd>
            <dt className="text-ink-faint">R2 · Frente / ancho cara</dt>
            <dd>{morfologia.ratios.r2.toFixed(2)}</dd>
            <dt className="text-ink-faint">R3 · Mandíbula / ancho cara</dt>
            <dd>{morfologia.ratios.r3.toFixed(2)}</dd>
            <dt className="text-ink-faint">R4 · Ángulo mandibular</dt>
            <dd>{morfologia.ratios.r4.toFixed(0)}°</dd>
            <dt className="text-ink-faint">R5 · Altura de frente</dt>
            <dd>{morfologia.ratios.r5.toFixed(2)}</dd>
          </dl>
          {morfologia.flags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {morfologia.flags.map((flag) => (
                <span
                  key={flag}
                  className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-xs text-ink-muted"
                >
                  {FLAG_CHIP_LABELS[flag]}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="panel mt-4 w-full max-w-sm px-4 py-3 text-sm text-ink">
          <p className="mb-2 font-semibold text-ink">Historial</p>
          <ul className="flex flex-col gap-3">
            {sortedHistorial.map((entry, index) => (
              <li key={`${entry.fecha}-${index}`} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
                <p className="text-xs text-ink-faint">{formatFecha(entry.fecha)}</p>
                <p className="font-semibold text-ink">{entry.corteNombre}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {entry.spec.costados} · {entry.spec.arriba} · {entry.spec.nuca} · {entry.spec.contorno}
                </p>
                {entry.nota && <p className="mt-1 text-xs italic text-ink-faint">{entry.nota}</p>}
              </li>
            ))}
          </ul>
        </div>

        {repetirError && (
          <div className="mt-4 w-full max-w-sm rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger-ink">
            {repetirError}
          </div>
        )}

        <div className="mt-4 flex w-full max-w-sm flex-col gap-2">
          <button
            type="button"
            onClick={handleRepetir}
            disabled={cuts === null}
            className="btn btn-primary w-full"
          >
            {cuts === null ? 'Cargando…' : 'Repetir el último'}
          </button>
          <button
            type="button"
            onClick={() => setFichaView({ kind: 'ajustando' })}
            className="btn btn-secondary w-full"
          >
            Ajustar
          </button>
        </div>

        <VersionFooter />
      </div>
    )
  }

  // --- Búsqueda por alias (sección 5: ruta principal, 90% del uso real). ---

  const normalizedQuery = query.trim().toLowerCase()
  const filtered =
    fichas === null ? [] : normalizedQuery === '' ? fichas : fichas.filter((f) => f.alias.toLowerCase().includes(normalizedQuery))

  return (
    <div className="flex min-h-svh flex-col items-center bg-app px-4 pb-16 pt-8 text-ink">
      <div className="flex w-full max-w-sm items-center">
        <button type="button" onClick={onExit} className="min-h-14 px-2 text-sm font-semibold text-ink-muted">
          ← Inicio
        </button>
      </div>

      <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Buscar cliente</h1>
      <p className="mt-1 text-sm text-ink-muted">Alias, historial y repetir el último corte</p>

      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar por alias…"
        className="mt-6 min-h-14 w-full max-w-sm rounded-xl border border-line bg-surface px-4 text-base text-ink placeholder:text-ink-faint"
      />

      {loadError && (
        <div className="mt-4 w-full max-w-sm rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger-ink">
          {loadError}
        </div>
      )}

      {fichas === null && !loadError && <p className="mt-8 text-sm text-ink-muted">Cargando fichas…</p>}

      {fichas !== null && fichas.length === 0 && (
        <p className="mt-8 max-w-sm text-center text-sm text-ink-muted">
          Todavía no hay ninguna ficha guardada. Se crean automáticamente desde "Cliente nuevo" al tocar "Este hice".
        </p>
      )}

      {fichas !== null && fichas.length > 0 && filtered.length === 0 && (
        <p className="mt-8 max-w-sm text-center text-sm text-ink-muted">Ningún cliente con ese alias.</p>
      )}

      <ul className="mt-4 flex w-full max-w-sm flex-col gap-2">
        {filtered.map((ficha) => {
          const last = ficha.historial[ficha.historial.length - 1]
          return (
            <li key={ficha.id}>
              <button
                type="button"
                onClick={() => openFicha(ficha)}
                className="panel flex min-h-14 w-full flex-col items-start px-4 py-3 text-left transition active:scale-[0.98]"
              >
                <span className="font-semibold text-ink">{ficha.alias}</span>
                {last && (
                  <span className="mt-0.5 text-xs text-ink-muted">
                    Último: {formatFecha(last.fecha)} · {last.corteNombre}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <VersionFooter />
    </div>
  )
}

/** Formatea una fecha ISO 8601 al formato rioplatense corto (día/mes/año). */
function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
