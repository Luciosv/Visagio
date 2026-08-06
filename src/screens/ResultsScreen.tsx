// Pantalla de RESULTADOS y detalle de un corte (sección 10 de CLAUDE.md).
// Extraído de `NuevoClienteScreen.tsx` en la Fase 6b: el agente de la Fase 6a
// ya había dejado el comentario de que este era el punto de enganche
// esperado para que "cliente que vuelve" (`screens/BuscarClienteScreen.tsx`,
// rutas "Repetir el último" y "Ajustar") pudiera reusar la misma UI de
// cards/detalle/compartir sin duplicarla.
//
// Lo único que cambia entre "cliente nuevo" y "cliente que vuelve" es CÓMO se
// persiste "Este hice": el primero crea una ficha nueva (pide alias), el
// segundo agrega una entrada al historial de una ficha que ya existe (no hace
// falta preguntar nada). Eso se parametriza con `GuardarFichaTarget`, que
// `CutDetailScreen` recibe como prop — nada de duplicar el componente para
// una diferencia que es, en el fondo, un solo `if`.

import { useEffect, useState, type FormEvent } from 'react'
import type {
  AppConfig,
  BarberInput,
  CutDescartado,
  CutLength,
  CutRecommendation,
  DescarteMotivo,
  FaceRatios,
  FaceShape,
  FaceShapeClassification,
  FaceShapeScore,
  MorfologiaCliente,
} from '../types'
import { CUT_LENGTHS, DESCARTE_MOTIVOS } from '../types'
import { explainRecommendation } from '../engine/explain'
import { buildFeedbackEvento } from '../engine/feedback'
import { buildShareCardContent } from '../engine/shareCard'
import { renderShareCardPng, shareCardPng } from '../shareImage'
import { agregarHistorial, crearFicha, registrarEventoFeedback } from '../data/db'
import { getSesionId } from '../data/sesionId'
import { VersionFooter } from '../components/ui'

/**
 * Todo lo que la pantalla de resultados necesita para mostrar las cards y
 * armar el porqué de cada una (`explain.ts` pide el desglose MÁS el
 * contexto: la clasificación de forma ya con la corrección del barbero
 * aplicada, los ratios y el form completo). También lleva la forma SUGERIDA
 * cruda (pre-override) y la que quedó corregida sin combinar: `explain.ts`
 * necesita la clasificación ya combinada (`faceShape`), pero guardar la
 * ficha de cliente (`MorfologiaCliente`, sección 5) necesita distinguir las
 * dos por separado.
 */
export interface ResultsContext {
  readonly recommendations: readonly CutRecommendation[]
  readonly faceShape: FaceShapeClassification
  readonly ratios: FaceRatios
  readonly barberInput: BarberInput
  readonly faceShapeSuggestedTop1: FaceShapeScore
  readonly faceShapeCorrectedShape: FaceShape
  /**
   * Delta vertical normalizado entre el nacimiento sugerido (landmark 10) y
   * el corregido por el barbero (7.4 de CLAUDE.md), dato de calibración de la
   * sección 2.3. `null` cuando esta consulta no pasó por una foto nueva con
   * ajuste de nacimiento — el camino "Buscar cliente → Ajustar"
   * (`BuscarClienteScreen.tsx`) reusa los ratios YA GUARDADOS de una consulta
   * anterior y no tiene ningún ajuste nuevo que reportar.
   */
  readonly ajusteLineaNacimiento: number | null
}

/**
 * Estado de la sesión de feedback de ESTA pantalla de resultados (Fase 7,
 * sección 2.3), vive en `ResultsScreen` — no en `CutDetailScreen`, que se
 * desmonta y remonta cada vez que se abre/cierra el detalle de un corte
 * distinto — para que los descartes se acumulen a lo largo de toda la
 * consulta, no solo del último corte que se miró. `null` cuando no hay un
 * `ResultsContext` real de por medio (camino "Repetir el último" de
 * `BuscarClienteScreen.tsx`: no hay ranking ni form que reportar, así que no
 * tiene sentido ofrecer 👎 ni armar un `EventoFeedback` ahí).
 */
export interface FeedbackSesionState {
  readonly descartados: readonly CutDescartado[]
  readonly onDescartar: (descarte: CutDescartado) => void
  /** `Date.now()` de cuando se entró a esta pantalla de resultados, para calcular `segundosEnPantalla`. */
  readonly entradaTimestamp: number
}

/**
 * A quién persistir el "Este hice" de `CutDetailScreen` (ver comentario de
 * arriba del archivo). `nueva` es el camino de "cliente nuevo": todavía no
 * existe ninguna ficha, hay que pedir alias y crearla con `crearFicha`. En
 * ese caso `CutDetailScreen` necesita el `ResultsContext` completo (para
 * construir la `MorfologiaCliente` de esta consulta) — se lo pasa `results`,
 * que por eso es obligatorio ahí abajo aunque en el otro caso no se use.
 * `existente` es "cliente que vuelve": la ficha y su morfología ya existen,
 * solo hace falta `agregarHistorial` con el `fichaId`, sin pedir nada.
 */
export type GuardarFichaTarget =
  | { readonly kind: 'nueva' }
  | { readonly kind: 'existente'; readonly fichaId: string; readonly alias: string }

/** Etiquetas del toggle de longitud de la pantalla de resultados (sección 9). CUIDADO: esto es la longitud del ESTILO del corte (`Cut.longitud`), no el largo actual del pelo del cliente (`LargoActualArriba`) — son dos conceptos distintos. */
const CUT_LENGTH_LABELS: Record<CutLength, string> = {
  corto: 'Corto',
  medio: 'Medio',
  largo: 'Largo',
}

/** Cuántos cortes del ranking completo se muestran en la pantalla de resultados (sección 11: "top 3-5 con maniquí"). */
const RESULTS_TOP_N = 5

interface ResultsScreenProps {
  readonly results: ResultsContext
  readonly config: AppConfig
  readonly lengthFilter: CutLength | 'todos'
  readonly onLengthFilterChange: (filter: CutLength | 'todos') => void
  readonly selected: CutRecommendation | null
  readonly onSelect: (recommendation: CutRecommendation | null) => void
  readonly onBack: () => void
  readonly onExit: () => void
  readonly guardarFichaTarget: GuardarFichaTarget
}

/**
 * Pantalla de RESULTADOS (sección 10). Reemplaza toda la pantalla de
 * análisis/form mientras está activa: es una pantalla propia del flujo, no un
 * panel más apilado abajo. El toggle de longitud filtra por `Cut.longitud`
 * (longitud del ESTILO), no por `LargoActualArriba` (largo actual del pelo
 * del cliente) — son dos conceptos con nombres parecidos a propósito de no
 * confundir.
 */
export function ResultsScreen({
  results,
  config,
  lengthFilter,
  onLengthFilterChange,
  selected,
  onSelect,
  onBack,
  onExit,
  guardarFichaTarget,
}: ResultsScreenProps) {
  // Sesión de feedback de ESTA pantalla de resultados (Fase 7, sección 2.3):
  // arranca vacía/en el momento del mount, y sobrevive mientras el barbero
  // abre y cierra el detalle de distintos cortes (`ResultsScreen` es el
  // mismo componente montado durante toda la consulta; solo `CutDetailScreen`
  // se desmonta al volver a la lista). Si el barbero vuelve al form y arma
  // una consulta nueva, el `ResultsScreen` se remonta de cero y esto arranca
  // de nuevo, que es lo correcto: es una consulta distinta.
  const [descartados, setDescartados] = useState<readonly CutDescartado[]>([])
  const [entradaTimestamp] = useState(() => Date.now())

  function handleDescartar(descarte: CutDescartado) {
    setDescartados((prev) => [...prev, descarte])
  }

  if (selected) {
    return (
      <CutDetailScreen
        recommendation={selected}
        results={results}
        config={config}
        onBack={() => onSelect(null)}
        onExit={onExit}
        guardarFichaTarget={guardarFichaTarget}
        feedbackSesion={{ descartados, onDescartar: handleDescartar, entradaTimestamp }}
      />
    )
  }

  const filtered = results.recommendations.filter((r) => lengthFilter === 'todos' || r.cut.longitud === lengthFilter)
  const top = filtered.slice(0, RESULTS_TOP_N)
  const lengthOptions: readonly (CutLength | 'todos')[] = ['todos', ...CUT_LENGTHS]
  // Score máximo de la lista MOSTRADA (post-filtro), no del ranking completo:
  // la barra de match de cada card es relativa a lo que el barbero está viendo
  // ahora, no a un top-1 que puede haber quedado afuera del filtro de longitud.
  const maxScore = top.length > 0 ? top[0].score : 0

  return (
    <div className="flex min-h-svh flex-col items-center bg-app px-4 pb-8 pt-8 text-ink">
      <div className="flex w-full max-w-sm items-center justify-between">
        <button type="button" onClick={onBack} className="min-h-14 px-2 text-sm font-semibold text-ink-muted">
          ← Volver
        </button>
        <h1 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">Resultados</h1>
        <span className="w-14" aria-hidden />
      </div>

      {/* Toggle de longitud EN la pantalla de resultados (sección 9: "el barbero quiere poder comparar corto contra largo delante del cliente"). */}
      <div className="mt-4 flex w-full max-w-sm gap-2">
        {lengthOptions.map((option) => {
          const isSelected = lengthFilter === option
          return (
            <button
              key={option}
              type="button"
              onClick={() => onLengthFilterChange(option)}
              aria-pressed={isSelected}
              className="chip flex-1"
            >
              {option === 'todos' ? 'Todos' : CUT_LENGTH_LABELS[option]}
            </button>
          )
        })}
      </div>

      {top.length === 0 && (
        <p className="mt-8 max-w-sm text-center text-sm text-ink-muted">
          Ningún corte de esta longitud en el ranking. Probá con otro filtro.
        </p>
      )}

      <div className="mt-4 flex w-full max-w-sm flex-col gap-3">
        {top.map((recommendation, index) => (
          <CutCard
            key={recommendation.cut.id}
            recommendation={recommendation}
            faceShape={results.faceShape}
            ratios={results.ratios}
            barberInput={results.barberInput}
            rank={index + 1}
            maxScore={maxScore}
            onOpen={() => onSelect(recommendation)}
          />
        ))}
      </div>

      <VersionFooter />
    </div>
  )
}

interface CutCardProps {
  readonly recommendation: CutRecommendation
  readonly faceShape: FaceShapeClassification
  readonly ratios: FaceRatios
  readonly barberInput: BarberInput
  /** Posición en la lista MOSTRADA (1-based): el `#1` es el destacado, el resto se numera discreto. */
  readonly rank: number
  /** Score del corte en el puesto 1 de la lista mostrada, para normalizar la barra de match de ESTA card (nunca un porcentaje: sería falsa precisión, CLAUDE.md 3/12). */
  readonly maxScore: number
  readonly onOpen: () => void
}

/** Card de un corte recomendado: nombre, maniquí, y la línea de "porqué" de `explain.ts` (sección 9: "sin explicación el barbero no lo puede usar delante del cliente"). El top-1 se destaca con acento latón para que salte a la vista sin leer (hallazgo #1). */
function CutCard({ recommendation, faceShape, ratios, barberInput, rank, maxScore, onOpen }: CutCardProps) {
  const { cut, caminoEnVariosCortes, score } = recommendation
  const why = explainRecommendation(recommendation, faceShape, ratios, barberInput)
  const isTop = rank === 1
  // Ancho relativo de la barra de match: score de esta card / score del top-1
  // de la lista mostrada, clampeado a [0,1]. Sin barra si el top-1 no punteó
  // (caso raro, evita dividir por 0 o negativos).
  const matchWidthPct = maxScore > 0 ? Math.max(0, Math.min(1, score / maxScore)) * 100 : null

  return (
    <button
      type="button"
      onClick={onOpen}
      className={
        'flex min-h-24 items-center gap-3 rounded-xl p-3 text-left transition active:scale-[0.98] ' +
        (isTop ? 'border-2 border-accent bg-surface' : 'border border-line bg-surface')
      }
    >
      <img
        src={cut.imagenes.tresCuartos}
        alt=""
        className="h-16 w-16 flex-shrink-0 rounded-lg bg-surface-2 object-contain"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {isTop ? (
            <span className="font-display text-xs font-semibold uppercase tracking-wide text-accent-ink">
              Recomendado
            </span>
          ) : (
            <span className="text-xs font-semibold text-ink-faint">#{rank}</span>
          )}
          {!cut.verificado && (
            <span className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">Sin verificar</span>
          )}
        </div>
        <p className="mt-0.5 font-display text-base font-semibold text-ink">{cut.nombre}</p>
        {matchWidthPct !== null && (
          <div className="mt-1.5 h-1 w-full max-w-[7rem] overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div
              className={isTop ? 'h-full rounded-full bg-accent' : 'h-full rounded-full bg-ink-faint'}
              style={{ width: `${matchWidthPct}%` }}
            />
          </div>
        )}
        <p className="mt-1 text-xs text-ink-muted">{why}</p>
        {caminoEnVariosCortes && (
          <p className="mt-1 text-xs font-medium text-accent-ink">
            Con el largo actual no todavía, pero es un buen camino en 2-3 cortes
          </p>
        )}
      </div>
    </button>
  )
}

interface CutDetailScreenProps {
  readonly recommendation: CutRecommendation
  /**
   * `null` es válido cuando `guardarFichaTarget.kind === 'existente'`
   * (camino "Repetir el último": no hay un `ResultsContext` real de por
   * medio, se abre el detalle directo sobre una `CutRecommendation`
   * sintética armada a partir del historial). Si `guardarFichaTarget.kind
   * === 'nueva'`, el llamador tiene que pasar el `ResultsContext` real: sin
   * él no hay de dónde sacar la `MorfologiaCliente` para `crearFicha`.
   */
  readonly results: ResultsContext | null
  readonly config: AppConfig
  readonly onBack: () => void
  readonly onExit: () => void
  readonly guardarFichaTarget: GuardarFichaTarget
  /** `null` en el camino "Repetir el último" (ver comentario de `FeedbackSesionState`): sin sesión de feedback, el 👎 queda deshabilitado y "Este hice" no arma ningún `EventoFeedback`. */
  readonly feedbackSesion: FeedbackSesionState | null
}

/**
 * Estado del botón "Compartir al cliente" (sección 2.2). Vive acá, no en
 * `types.ts`: es estado transitorio de esta pantalla, no un tipo de dominio.
 *
 *  - `idle`: nada en curso.
 *  - `generando`: armando el PNG (carga de imagen + `canvas.toBlob`).
 *  - `fallback`: `canShare({ files })` no está disponible (típico en
 *    desktop) — se ofrece la descarga manual en su lugar.
 *  - `error`: algo falló armando el PNG (no un rechazo/cancelación del
 *    usuario en el share nativo, eso se trata como `idle`).
 */
type ShareState =
  | { readonly status: 'idle' }
  | { readonly status: 'generando' }
  | { readonly status: 'fallback'; readonly url: string }
  | { readonly status: 'error'; readonly message: string }

/**
 * Estado de "Este hice" → guardar en la ficha de cliente. `pidiendo-alias`
 * solo se usa cuando `guardarFichaTarget.kind === 'nueva'` (cliente nuevo,
 * sección 5: "el barbero elige cómo llamarlo, no hace falta nombre
 * completo"); cuando la ficha ya existe se salta directo a `guardando`, sin
 * preguntar nada.
 */
type GuardarFichaState =
  | { readonly status: 'idle' }
  | { readonly status: 'pidiendo-alias' }
  | { readonly status: 'guardando' }
  | { readonly status: 'guardado'; readonly alias: string }
  | { readonly status: 'error'; readonly message: string }

/** Ícono de "pulgar abajo" para el botón de descarte (reemplaza el emoji 👎: un emoji como ícono renderiza distinto según el sistema operativo — no es la letra chica del oficio, es un anti-patrón de UI). Path de Lucide `thumbs-down`, inline para no sumar una dependencia nueva por un solo ícono. */
function ThumbsDownIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 14V2" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  )
}

/** Etiquetas de los chips de motivo de descarte (👎), EXACTOS de la sección 2.3 — nunca texto libre. */
const DESCARTE_MOTIVO_LABELS: Record<DescarteMotivo, string> = {
  no_le_gusta_al_cliente: 'No le gusta al cliente',
  no_le_va_a_la_cara: 'No le va a la cara',
  el_pelo_no_da: 'El pelo no da',
  no_lo_mantiene: 'No lo mantiene',
  mal_ejecutable: 'Mal ejecutable',
}

/**
 * Detalle de un corte (sección 10): spec, pasos, cuidados, mantenimiento,
 * "Compartir al cliente" (PNG + Web Share, sección 2.2), "Este hice"
 * (parametrizado con `guardarFichaTarget`, ver comentario de arriba del
 * archivo) y 👎 con chips de motivo (Fase 7, sección 2.3). Al confirmar
 * "Este hice" con una sesión de feedback disponible (`feedbackSesion`), se
 * arma y guarda un `EventoFeedback` completo ADEMÁS de la ficha de cliente —
 * son dos escrituras independientes, un fallo en la segunda nunca bloquea la
 * primera (ver `registrarFeedbackDeEsteHice` más abajo).
 */
export function CutDetailScreen({ recommendation, results, config, onBack, onExit, guardarFichaTarget, feedbackSesion }: CutDetailScreenProps) {
  const { cut, caminoEnVariosCortes } = recommendation
  const [shareState, setShareState] = useState<ShareState>({ status: 'idle' })
  const [guardarState, setGuardarState] = useState<GuardarFichaState>({ status: 'idle' })
  const [aliasInput, setAliasInput] = useState('')
  const [descarteAbierto, setDescarteAbierto] = useState(false)

  // Libera el blob URL del fallback anterior en cuanto se deja atrás ese
  // estado (nuevo intento de compartir, o se desmonta la pantalla con el
  // fallback todavía mostrado) para no dejar memoria colgada.
  useEffect(() => {
    return () => {
      if (shareState.status === 'fallback') URL.revokeObjectURL(shareState.url)
    }
  }, [shareState])

  async function handleShareClick() {
    setShareState({ status: 'generando' })
    try {
      const content = buildShareCardContent(recommendation, config)
      const blob = await renderShareCardPng(content)
      // A partir de acá no hay más awaits que no sean el propio `share()`:
      // la sección 2.2 pide dispararlo pegado al click, sin trabajo de por
      // medio, para no perder la activación transitoria del usuario.
      const result = await shareCardPng(blob)
      if (result === 'compartido') {
        setShareState({ status: 'idle' })
      } else {
        setShareState({ status: 'fallback', url: URL.createObjectURL(blob) })
      }
    } catch (error) {
      // El barbero cerró el panel nativo de compartir: no es un error, es
      // una cancelación normal, se vuelve a `idle` en silencio.
      if (error instanceof DOMException && error.name === 'AbortError') {
        setShareState({ status: 'idle' })
        return
      }
      setShareState({
        status: 'error',
        message: 'No se pudo generar la imagen para compartir. Probá de nuevo.',
      })
    }
  }

  /** `formaCorregida` es `null` si el barbero no tocó el selector (mismo criterio que la telemetría de la sección 2.3 y que `MorfologiaCliente`): se compara contra la forma SUGERIDA cruda, no contra la clasificación ya combinada por `applyFaceShapeOverride`. */
  function formaCorregidaOrNull(ctx: ResultsContext): FaceShape | null {
    return ctx.faceShapeCorrectedShape === ctx.faceShapeSuggestedTop1.shape ? null : ctx.faceShapeCorrectedShape
  }

  /**
   * Arma y guarda el `EventoFeedback` de esta consulta (Fase 7, sección 2.3)
   * al confirmar "Este hice". Necesita el `ResultsContext` completo (ratios,
   * forma, form del barbero, ranking) MÁS la sesión de feedback de esta
   * pantalla (descartes acumulados, timestamp de entrada) — si falta
   * cualquiera de los dos (camino "Repetir el último") no hay nada que
   * reportar y se sale en silencio. Un fallo acá NUNCA debe bloquear ni
   * ensuciar el flujo principal de guardar la ficha del cliente: se ignora
   * en silencio, es una señal de calibración, no el dato que le importa al
   * barbero en la silla.
   */
  async function registrarFeedbackDeEsteHice() {
    if (!results || !feedbackSesion) return
    try {
      const evento = buildFeedbackEvento({
        sesion: getSesionId(),
        ratios: results.ratios,
        formaSugerida: results.faceShapeSuggestedTop1,
        formaCorregida: formaCorregidaOrNull(results),
        ajusteLineaNacimiento: results.ajusteLineaNacimiento,
        barberInput: results.barberInput,
        ranking: results.recommendations.map((r) => r.cut.id),
        elegido: cut.id,
        descartados: feedbackSesion.descartados,
        segundosEnPantalla: Math.round((Date.now() - feedbackSesion.entradaTimestamp) / 1000),
      })
      await registrarEventoFeedback(evento)
    } catch {
      // Ver comentario de arriba: el feedback es secundario al guardado de
      // la ficha, un fallo acá no se muestra ni interrumpe nada.
    }
  }

  /** Camino "cliente nuevo": pide alias y crea la ficha con la morfología de esta consulta. */
  async function handleConfirmarAlias(event: FormEvent) {
    event.preventDefault()
    if (guardarFichaTarget.kind !== 'nueva' || !results) return
    const alias = aliasInput.trim()
    if (alias.length === 0) return

    setGuardarState({ status: 'guardando' })
    try {
      const morfologia: MorfologiaCliente = {
        formaSugerida: results.faceShapeSuggestedTop1,
        formaCorregida: formaCorregidaOrNull(results),
        ratios: results.ratios,
        flags: results.barberInput.flags,
      }

      await crearFicha({
        alias,
        morfologia,
        primerHistorial: {
          fecha: new Date().toISOString(),
          corteId: cut.id,
          corteNombre: cut.nombre,
          spec: cut.spec,
        },
        // Fase G: el form recién confirmado precarga "Ajustar" la próxima
        // vez que este cliente vuelva (`BuscarClienteScreen.openFicha`).
        ultimoForm: {
          textura: results.barberInput.textura,
          densidad: results.barberInput.densidad,
          minutosDeclarados: results.barberInput.minutosDeclarados,
          largoActualArriba: results.barberInput.largoActualArriba,
        },
      })
      await registrarFeedbackDeEsteHice()

      setGuardarState({ status: 'guardado', alias })
    } catch (error) {
      setGuardarState({
        status: 'error',
        message: error instanceof Error ? error.message : 'No se pudo guardar la ficha. Probá de nuevo.',
      })
    }
  }

  /** Camino "cliente que vuelve": la ficha ya existe, solo se agrega una entrada de historial. Sin pedir nada — un solo tap. */
  async function handleGuardarExistente() {
    if (guardarFichaTarget.kind !== 'existente') return
    setGuardarState({ status: 'guardando' })
    try {
      // `results` es `null` en el camino "Repetir el último" (ver
      // `CutDetailScreenProps.results`): ahí no hay `BarberInput` de esta
      // visita porque no se tocó el form, así que no hay `ultimoForm` que
      // actualizar (Fase G: `agregarHistorial` deja el que ya tenía la
      // ficha tal cual cuando se omite este argumento). En "Ajustar" sí hay
      // `results` con el form recién confirmado.
      const updated = await agregarHistorial(
        guardarFichaTarget.fichaId,
        {
          fecha: new Date().toISOString(),
          corteId: cut.id,
          corteNombre: cut.nombre,
          spec: cut.spec,
        },
        results
          ? {
              textura: results.barberInput.textura,
              densidad: results.barberInput.densidad,
              minutosDeclarados: results.barberInput.minutosDeclarados,
              largoActualArriba: results.barberInput.largoActualArriba,
            }
          : undefined,
      )
      if (!updated) {
        setGuardarState({ status: 'error', message: 'No se encontró la ficha. Puede que se haya borrado.' })
        return
      }
      await registrarFeedbackDeEsteHice()
      setGuardarState({ status: 'guardado', alias: guardarFichaTarget.alias })
    } catch (error) {
      setGuardarState({
        status: 'error',
        message: error instanceof Error ? error.message : 'No se pudo guardar en la ficha. Probá de nuevo.',
      })
    }
  }

  function handleEsteHiceClick() {
    if (guardarFichaTarget.kind === 'nueva') {
      setGuardarState({ status: 'pidiendo-alias' })
    } else {
      void handleGuardarExistente()
    }
  }

  /** Chip de motivo tocado: registra el descarte en la sesión de feedback y vuelve a la lista de resultados para que el barbero elija otro corte (criterio propio: no hay una respuesta única en la sección 2.3 para "qué pasa después de un 👎"). */
  function handleDescartarConMotivo(motivo: DescarteMotivo) {
    feedbackSesion?.onDescartar({ id: cut.id, motivo })
    setDescarteAbierto(false)
    onBack()
  }

  return (
    <div className="flex min-h-svh flex-col items-center bg-app px-4 pb-8 pt-8 text-ink">
      <div className="flex w-full max-w-sm items-center">
        <button type="button" onClick={onBack} className="min-h-14 px-2 text-sm font-semibold text-ink-muted">
          ← Volver
        </button>
      </div>

      <h1 className="mt-2 w-full max-w-sm font-display text-2xl font-semibold text-ink">{cut.nombre}</h1>
      {!cut.verificado && (
        <p className="mt-1 w-full max-w-sm text-[11px] font-medium uppercase tracking-wide text-ink-faint">
          Dato sin verificar todavía — a confirmar con el barbero
        </p>
      )}
      {caminoEnVariosCortes && (
        <div className="mt-3 w-full max-w-sm rounded-xl border border-accent bg-surface px-4 py-3 text-sm text-accent-ink">
          Con el largo actual no todavía, pero es un buen camino en 2-3 cortes.
        </div>
      )}

      <img
        src={cut.imagenes.tresCuartos}
        alt=""
        className="mt-4 h-40 w-40 rounded-xl bg-surface object-contain"
      />

      {/* Spec técnica: lo que el barbero necesita YA para cortar (hallazgo #8). Se destaca con acento sobre Pasos/Cuidados, que son paneles secundarios normales. */}
      <div className="mt-4 w-full max-w-sm rounded-xl border-2 border-accent bg-surface px-4 py-3 text-sm text-ink">
        <p className="mb-2 font-display text-base font-semibold uppercase tracking-wide text-accent-ink">
          Spec técnica
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-ink-muted">Costados</dt>
          <dd>{cut.spec.costados}</dd>
          <dt className="text-ink-muted">Arriba</dt>
          <dd>{cut.spec.arriba}</dd>
          <dt className="text-ink-muted">Nuca</dt>
          <dd>{cut.spec.nuca}</dd>
          <dt className="text-ink-muted">Contorno</dt>
          <dd>{cut.spec.contorno}</dd>
        </dl>
      </div>

      <div className="panel mt-4 w-full max-w-sm px-4 py-3 text-sm text-ink">
        <p className="mb-2 font-semibold text-ink">Pasos</p>
        <ol className="list-decimal space-y-1 pl-4">
          {cut.pasos.map((paso) => (
            <li key={paso}>{paso}</li>
          ))}
        </ol>
      </div>

      <div className="panel mt-4 w-full max-w-sm px-4 py-3 text-sm text-ink">
        <p className="mb-2 font-semibold text-ink">Cuidados</p>
        <ul className="list-disc space-y-1 pl-4">
          {cut.cuidados.map((cuidado) => (
            <li key={cuidado}>{cuidado}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-muted">
          Mantenimiento: cada {cut.mantenimientoSemanas} semanas. Dificultad {cut.dificultad}/5, ~
          {cut.tiempoEjecucionMin} min de sillón.
        </p>
      </div>

      <div className="mt-4 flex w-full max-w-sm flex-col gap-2">
        <button
          type="button"
          onClick={handleShareClick}
          disabled={shareState.status === 'generando'}
          className="btn btn-primary w-full"
        >
          {shareState.status === 'generando' ? 'Armando la ficha…' : 'Compartir al cliente'}
        </button>

        {shareState.status === 'fallback' && (
          <div className="panel px-4 py-3 text-sm text-ink">
            <p>Guardá la imagen y mandala por WhatsApp.</p>
            <a href={shareState.url} download="corte.png" className="btn btn-secondary mt-2 w-full">
              Descargar imagen
            </a>
          </div>
        )}

        {shareState.status === 'error' && (
          <p className="rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger-ink">
            {shareState.message}
          </p>
        )}

        {guardarState.status === 'guardado' ? (
          <div className="rounded-xl border border-select bg-surface px-4 py-3 text-sm text-ink">
            <p>Guardado en la ficha de {guardarState.alias}.</p>
            <button type="button" onClick={onExit} className="btn btn-secondary mt-2 w-full">
              Volver a inicio
            </button>
          </div>
        ) : guardarState.status === 'pidiendo-alias' ? (
          <form onSubmit={handleConfirmarAlias} className="panel px-4 py-3">
            <label htmlFor="alias-ficha" className="text-sm font-semibold text-ink">
              ¿Cómo le decís a este cliente?
            </label>
            <p className="mt-1 text-xs text-ink-muted">
              Un alias o apodo alcanza, no hace falta el nombre completo.
            </p>
            <input
              id="alias-ficha"
              type="text"
              autoFocus
              value={aliasInput}
              onChange={(event) => setAliasInput(event.target.value)}
              placeholder="Ej: Juan (campera roja)"
              className="mt-3 min-h-14 w-full rounded-xl border border-line bg-app px-4 text-base text-ink placeholder:text-ink-faint"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setGuardarState({ status: 'idle' })}
                className="btn btn-secondary flex-1"
              >
                Cancelar
              </button>
              <button type="submit" disabled={aliasInput.trim().length === 0} className="btn btn-primary flex-1">
                Guardar
              </button>
            </div>
          </form>
        ) : descarteAbierto ? (
          <div className="panel px-4 py-3">
            <p className="text-sm font-semibold text-ink">¿Por qué se descarta este corte?</p>
            <div className="mt-3 flex flex-col gap-2">
              {DESCARTE_MOTIVOS.map((motivo) => (
                <button
                  key={motivo}
                  type="button"
                  onClick={() => handleDescartarConMotivo(motivo)}
                  className="chip text-left"
                >
                  {DESCARTE_MOTIVO_LABELS[motivo]}
                </button>
              ))}
              <button type="button" onClick={() => setDescarteAbierto(false)} className="btn btn-secondary">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-stretch gap-2">
            {/* "Este hice" es la señal más valiosa (CLAUDE.md 2.3): acción destacada
                del cierre, más peso que el descarte a su lado. */}
            <button
              type="button"
              onClick={handleEsteHiceClick}
              disabled={guardarState.status === 'guardando'}
              className="min-h-14 flex-[2] rounded-xl bg-select px-4 text-base font-semibold text-on-select transition active:scale-[0.98] disabled:opacity-60"
            >
              {guardarState.status === 'guardando' ? 'Guardando…' : 'Este hice'}
            </button>
            <button
              type="button"
              onClick={() => setDescarteAbierto(true)}
              disabled={feedbackSesion === null}
              title={feedbackSesion === null ? 'No disponible en "Repetir el último"' : undefined}
              aria-label="Descartar"
              className="flex min-h-14 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line px-3 text-xs font-semibold text-ink-muted transition active:scale-[0.98] disabled:opacity-40"
            >
              <ThumbsDownIcon />
              Descartar
            </button>
          </div>
        )}

        {guardarState.status === 'error' && (
          <p className="rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger-ink">
            {guardarState.message}
          </p>
        )}
      </div>

      <VersionFooter />
    </div>
  )
}
