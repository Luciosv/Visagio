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
  CutLength,
  CutRecommendation,
  FaceRatios,
  FaceShape,
  FaceShapeClassification,
  FaceShapeScore,
  MorfologiaCliente,
} from '../types'
import { CUT_LENGTHS } from '../types'
import { explainRecommendation } from '../engine/explain'
import { buildShareCardContent } from '../engine/shareCard'
import { renderShareCardPng, shareCardPng } from '../shareImage'
import { agregarHistorial, crearFicha } from '../data/db'
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
  if (selected) {
    return (
      <CutDetailScreen
        recommendation={selected}
        results={results}
        config={config}
        onBack={() => onSelect(null)}
        onExit={onExit}
        guardarFichaTarget={guardarFichaTarget}
      />
    )
  }

  const filtered = results.recommendations.filter((r) => lengthFilter === 'todos' || r.cut.longitud === lengthFilter)
  const top = filtered.slice(0, RESULTS_TOP_N)
  const lengthOptions: readonly (CutLength | 'todos')[] = ['todos', ...CUT_LENGTHS]

  return (
    <div className="flex min-h-svh flex-col items-center bg-neutral-950 px-4 pb-20 pt-8 text-neutral-50">
      <div className="flex w-full max-w-sm items-center justify-between">
        <button type="button" onClick={onBack} className="min-h-14 px-2 text-sm font-semibold text-neutral-300">
          ← Volver
        </button>
        <h1 className="text-xl font-semibold">Resultados</h1>
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
              className={
                'min-h-14 flex-1 rounded-xl border px-2 text-sm font-semibold transition active:scale-[0.98] ' +
                (isSelected
                  ? 'border-lime-400 bg-lime-400 text-neutral-950'
                  : 'border-neutral-700 bg-neutral-800 text-neutral-200')
              }
            >
              {option === 'todos' ? 'Todos' : CUT_LENGTH_LABELS[option]}
            </button>
          )
        })}
      </div>

      {top.length === 0 && (
        <p className="mt-8 max-w-sm text-center text-sm text-neutral-400">
          Ningún corte de esta longitud en el ranking. Probá con otro filtro.
        </p>
      )}

      <div className="mt-4 flex w-full max-w-sm flex-col gap-3">
        {top.map((recommendation) => (
          <CutCard
            key={recommendation.cut.id}
            recommendation={recommendation}
            faceShape={results.faceShape}
            ratios={results.ratios}
            barberInput={results.barberInput}
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
  readonly onOpen: () => void
}

/** Card de un corte recomendado: nombre, maniquí, y la línea de "porqué" de `explain.ts` (sección 9: "sin explicación el barbero no lo puede usar delante del cliente"). */
function CutCard({ recommendation, faceShape, ratios, barberInput, onOpen }: CutCardProps) {
  const { cut, caminoEnVariosCortes } = recommendation
  const why = explainRecommendation(recommendation, faceShape, ratios, barberInput)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-24 items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-left transition active:scale-[0.98]"
    >
      <img
        src={cut.imagenes.tresCuartos}
        alt=""
        className="h-16 w-16 flex-shrink-0 rounded-lg bg-neutral-800 object-contain"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-neutral-50">{cut.nombre}</span>
          {!cut.verificado && (
            <span className="rounded-full border border-amber-500 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-400">
              Sin verificar
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-neutral-400">{why}</p>
        {caminoEnVariosCortes && (
          <p className="mt-1 text-xs font-medium text-sky-400">
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

/**
 * Detalle de un corte (sección 10): spec, pasos, cuidados, mantenimiento,
 * "Compartir al cliente" (PNG + Web Share, sección 2.2) y "Este hice"
 * (parametrizado con `guardarFichaTarget`, ver comentario de arriba del
 * archivo). El 👎 con chips de motivo sigue deshabilitado a propósito: es
 * Fase 7 (cola de feedback), no esta, aunque comparta la fila de botones con
 * "Este hice".
 */
export function CutDetailScreen({ recommendation, results, config, onBack, onExit, guardarFichaTarget }: CutDetailScreenProps) {
  const { cut, caminoEnVariosCortes } = recommendation
  const [shareState, setShareState] = useState<ShareState>({ status: 'idle' })
  const [guardarState, setGuardarState] = useState<GuardarFichaState>({ status: 'idle' })
  const [aliasInput, setAliasInput] = useState('')

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

  /** Camino "cliente nuevo": pide alias y crea la ficha con la morfología de esta consulta. */
  async function handleConfirmarAlias(event: FormEvent) {
    event.preventDefault()
    if (guardarFichaTarget.kind !== 'nueva' || !results) return
    const alias = aliasInput.trim()
    if (alias.length === 0) return

    setGuardarState({ status: 'guardando' })
    try {
      // `formaCorregida` es `null` si el barbero no tocó el selector de
      // forma (mismo criterio que la telemetría de la sección 2.3): se
      // compara contra la forma SUGERIDA cruda, no contra la clasificación
      // ya combinada por `applyFaceShapeOverride`.
      const formaCorregida =
        results.faceShapeCorrectedShape === results.faceShapeSuggestedTop1.shape
          ? null
          : results.faceShapeCorrectedShape

      const morfologia: MorfologiaCliente = {
        formaSugerida: results.faceShapeSuggestedTop1,
        formaCorregida,
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
      })

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
      const updated = await agregarHistorial(guardarFichaTarget.fichaId, {
        fecha: new Date().toISOString(),
        corteId: cut.id,
        corteNombre: cut.nombre,
        spec: cut.spec,
      })
      if (!updated) {
        setGuardarState({ status: 'error', message: 'No se encontró la ficha. Puede que se haya borrado.' })
        return
      }
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

  return (
    <div className="flex min-h-svh flex-col items-center bg-neutral-950 px-4 pb-20 pt-8 text-neutral-50">
      <div className="flex w-full max-w-sm items-center">
        <button type="button" onClick={onBack} className="min-h-14 px-2 text-sm font-semibold text-neutral-300">
          ← Volver
        </button>
      </div>

      <h1 className="mt-2 w-full max-w-sm text-2xl font-semibold">{cut.nombre}</h1>
      {!cut.verificado && (
        <p className="mt-1 w-full max-w-sm text-xs font-medium uppercase tracking-wide text-amber-400">
          Dato sin verificar todavía — a confirmar con el barbero
        </p>
      )}
      {caminoEnVariosCortes && (
        <div className="mt-3 w-full max-w-sm rounded-xl border border-sky-500 bg-sky-950 px-4 py-3 text-sm text-sky-200">
          Con el largo actual no todavía, pero es un buen camino en 2-3 cortes.
        </div>
      )}

      <img
        src={cut.imagenes.tresCuartos}
        alt=""
        className="mt-4 h-40 w-40 rounded-xl bg-neutral-900 object-contain"
      />

      <div className="mt-4 w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-200">
        <p className="mb-2 font-semibold text-neutral-100">Spec técnica</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-neutral-500">Costados</dt>
          <dd>{cut.spec.costados}</dd>
          <dt className="text-neutral-500">Arriba</dt>
          <dd>{cut.spec.arriba}</dd>
          <dt className="text-neutral-500">Nuca</dt>
          <dd>{cut.spec.nuca}</dd>
          <dt className="text-neutral-500">Contorno</dt>
          <dd>{cut.spec.contorno}</dd>
        </dl>
      </div>

      <div className="mt-4 w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-200">
        <p className="mb-2 font-semibold text-neutral-100">Pasos</p>
        <ol className="list-decimal space-y-1 pl-4">
          {cut.pasos.map((paso) => (
            <li key={paso}>{paso}</li>
          ))}
        </ol>
      </div>

      <div className="mt-4 w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-200">
        <p className="mb-2 font-semibold text-neutral-100">Cuidados</p>
        <ul className="list-disc space-y-1 pl-4">
          {cut.cuidados.map((cuidado) => (
            <li key={cuidado}>{cuidado}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-neutral-500">
          Mantenimiento: cada {cut.mantenimientoSemanas} semanas. Dificultad {cut.dificultad}/5, ~
          {cut.tiempoEjecucionMin} min de sillón.
        </p>
      </div>

      <div className="mt-4 flex w-full max-w-sm flex-col gap-2">
        <button
          type="button"
          onClick={handleShareClick}
          disabled={shareState.status === 'generando'}
          className="min-h-14 w-full rounded-xl bg-lime-400 px-6 text-base font-semibold text-neutral-950 transition active:scale-[0.98] disabled:opacity-60"
        >
          {shareState.status === 'generando' ? 'Armando la ficha…' : 'Compartir al cliente'}
        </button>

        {shareState.status === 'fallback' && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-200">
            <p>Guardá la imagen y mandala por WhatsApp.</p>
            <a
              href={shareState.url}
              download="corte.png"
              className="mt-2 flex min-h-14 items-center justify-center rounded-xl border border-lime-400 px-4 text-sm font-semibold text-lime-400"
            >
              Descargar imagen
            </a>
          </div>
        )}

        {shareState.status === 'error' && (
          <p className="rounded-xl border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-200">
            {shareState.message}
          </p>
        )}

        {guardarState.status === 'guardado' ? (
          <div className="rounded-xl border border-lime-500 bg-lime-950 px-4 py-3 text-sm text-lime-200">
            <p>Guardado en la ficha de {guardarState.alias}.</p>
            <button
              type="button"
              onClick={onExit}
              className="mt-2 flex min-h-14 w-full items-center justify-center rounded-xl border border-lime-400 px-4 text-sm font-semibold text-lime-400"
            >
              Volver a inicio
            </button>
          </div>
        ) : guardarState.status === 'pidiendo-alias' ? (
          <form
            onSubmit={handleConfirmarAlias}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3"
          >
            <label htmlFor="alias-ficha" className="text-sm font-semibold text-neutral-100">
              ¿Cómo le decís a este cliente?
            </label>
            <p className="mt-1 text-xs text-neutral-500">
              Un alias o apodo alcanza, no hace falta el nombre completo.
            </p>
            <input
              id="alias-ficha"
              type="text"
              autoFocus
              value={aliasInput}
              onChange={(event) => setAliasInput(event.target.value)}
              placeholder="Ej: Juan (campera roja)"
              className="mt-3 min-h-14 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 text-base text-neutral-50 placeholder:text-neutral-600"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setGuardarState({ status: 'idle' })}
                className="min-h-14 flex-1 rounded-xl border border-neutral-700 px-4 text-sm font-semibold text-neutral-300"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={aliasInput.trim().length === 0}
                className="min-h-14 flex-1 rounded-xl bg-lime-400 px-4 text-sm font-semibold text-neutral-950 disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </form>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleEsteHiceClick}
              disabled={guardarState.status === 'guardando'}
              className="min-h-14 flex-1 rounded-xl bg-neutral-800 px-4 text-sm font-semibold text-neutral-100 transition active:scale-[0.98] disabled:opacity-60"
            >
              {guardarState.status === 'guardando' ? 'Guardando…' : 'Este hice'}
            </button>
            <button
              type="button"
              disabled
              className="min-h-14 flex-1 rounded-xl bg-neutral-800 px-4 text-sm font-semibold text-neutral-500"
            >
              👎 (próximamente)
            </button>
          </div>
        )}

        {guardarState.status === 'error' && (
          <p className="rounded-xl border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-200">
            {guardarState.message}
          </p>
        )}
      </div>

      <VersionFooter />
    </div>
  )
}
