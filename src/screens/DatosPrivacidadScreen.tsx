// "Datos y privacidad" (Fase 6b + Fase 7, sección 5 de CLAUDE.md): "todo lo
// que la app junta sin que el barbero lo pida explícitamente... tiene que
// quedar accesible desde un lugar, no invisible dentro del teléfono". Se
// llega acá desde el link chico del pie de INICIO (`screens/HomeScreen.tsx`,
// ya armado). Muestra cuánto hay guardado y ofrece exportar todo / borrar
// todo, para las DOS fuentes que junta la app sin pedirlo explícitamente:
// fichas de cliente (Fase 6) y cola de feedback (Fase 7, sección 2.3) —
// sección 16: "sumar la cola de feedback a la pantalla de Datos y privacidad
// de la Fase 6, mismo exportar/borrar, ahora con las dos fuentes".

import { useEffect, useState } from 'react'
import {
  borrarTodasLasFichas,
  borrarTodosLosEventos,
  contarEventosFeedback,
  contarFichas,
  listarEventosFeedback,
  listarFichas,
} from '../data/db'
import { VersionFooter } from '../components/ui'

interface DatosPrivacidadScreenProps {
  readonly onBack: () => void
}

type BorrarState = 'idle' | 'confirmando' | 'borrando'

export function DatosPrivacidadScreen({ onBack }: DatosPrivacidadScreenProps) {
  const [fichasCount, setFichasCount] = useState<number | null>(null)
  const [eventosCount, setEventosCount] = useState<number | null>(null)
  const [countError, setCountError] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [borrarState, setBorrarState] = useState<BorrarState>('idle')
  const [borrarError, setBorrarError] = useState<string | null>(null)

  async function refreshCounts() {
    try {
      const [fichas, eventos] = await Promise.all([contarFichas(), contarEventosFeedback()])
      setFichasCount(fichas)
      setEventosCount(eventos)
      setCountError(null)
    } catch (error) {
      setCountError(error instanceof Error ? error.message : 'No se pudo contar lo guardado.')
    }
  }

  useEffect(() => {
    void refreshCounts()
  }, [])

  /** Exporta AMBAS fuentes (fichas + eventos de feedback) en un solo archivo — sección 5: "mismo exportar/borrar, ahora con las dos fuentes". */
  async function handleExportar() {
    setExportError(null)
    try {
      const [fichas, eventosFeedback] = await Promise.all([listarFichas(), listarEventosFeedback()])
      const json = JSON.stringify({ fichas, eventosFeedback }, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const fecha = new Date().toISOString().slice(0, 10)
      const link = document.createElement('a')
      link.href = url
      link.download = `visagio-datos-${fecha}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'No se pudo exportar. Probá de nuevo.')
    }
  }

  /** Borra AMBAS fuentes — misma confirmación de siempre, ahora vacía los dos stores. */
  async function handleConfirmarBorrado() {
    setBorrarState('borrando')
    setBorrarError(null)
    try {
      await Promise.all([borrarTodasLasFichas(), borrarTodosLosEventos()])
      await refreshCounts()
      setBorrarState('idle')
    } catch (error) {
      setBorrarError(error instanceof Error ? error.message : 'No se pudo borrar. Probá de nuevo.')
      setBorrarState('confirmando')
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center bg-app px-4 pb-16 pt-8 text-ink">
      <div className="flex w-full max-w-sm items-center">
        <button type="button" onClick={onBack} className="min-h-14 px-2 text-sm font-semibold text-ink-muted">
          ← Volver
        </button>
      </div>

      <h1 className="mt-2 w-full max-w-sm font-display text-2xl font-semibold text-ink">Datos y privacidad</h1>
      <p className="mt-1 w-full max-w-sm text-sm text-ink-muted">
        Todo lo que la app guarda en este teléfono, con acceso para exportarlo o borrarlo cuando quieras.
      </p>

      <div className="panel mt-6 w-full max-w-sm px-4 py-3 text-sm text-ink">
        <p className="mb-2 font-semibold text-ink">Guardado en este teléfono</p>
        <dl className="grid grid-cols-[1fr_auto] gap-y-1">
          <dt className="text-ink-muted">Fichas de cliente</dt>
          <dd className="text-right font-semibold text-ink">{fichasCount ?? '…'}</dd>
          <dt className="text-ink-muted">Eventos de feedback</dt>
          <dd className="text-right font-semibold text-ink">{eventosCount ?? '…'}</dd>
        </dl>
        {countError && <p className="mt-2 text-xs text-danger-ink">{countError}</p>}
      </div>

      <div className="panel mt-4 w-full max-w-sm px-4 py-3">
        <p className="text-sm font-semibold text-ink">Exportar todo</p>
        <p className="mt-1 text-xs text-ink-muted">
          Baja un archivo con las fichas de cliente y los eventos de feedback, para guardarlo en Drive o mandárselo
          al desarrollador.
        </p>
        <button type="button" onClick={handleExportar} className="btn btn-primary mt-3 w-full">
          Exportar todo
        </button>
        {exportError && <p className="mt-2 text-xs text-danger-ink">{exportError}</p>}
      </div>

      <div className="mt-4 w-full max-w-sm rounded-xl border border-danger bg-danger-surface/40 px-4 py-3">
        <p className="text-sm font-semibold text-ink">Borrar todo</p>
        <p className="mt-1 text-xs text-ink-muted">
          Borra todas las fichas de cliente y los eventos de feedback de este teléfono. No se puede deshacer —
          exportá antes si no tenés respaldo.
        </p>

        {borrarState !== 'idle' ? (
          <div className="mt-3 rounded-xl border border-danger bg-danger-surface px-4 py-3">
            <p className="text-sm font-semibold text-danger-ink">
              ¿Seguro que querés borrar TODAS las fichas y todos los eventos de feedback? Esta acción no se puede
              deshacer.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setBorrarState('idle')}
                disabled={borrarState === 'borrando'}
                className="btn btn-secondary flex-1 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarBorrado}
                disabled={borrarState === 'borrando'}
                className="btn btn-danger-solid flex-1 disabled:opacity-60"
              >
                {borrarState === 'borrando' ? 'Borrando…' : 'Sí, borrar todo'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setBorrarState('confirmando')}
            className="btn btn-danger mt-3 w-full"
          >
            Borrar todo
          </button>
        )}
        {borrarError && <p className="mt-2 text-xs text-danger-ink">{borrarError}</p>}
      </div>

      <VersionFooter />
    </div>
  )
}
