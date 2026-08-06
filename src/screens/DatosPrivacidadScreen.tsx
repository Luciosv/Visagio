// "Datos y privacidad" (Fase 6b, sección 5 de CLAUDE.md): "todo lo que la app
// junta sin que el barbero lo pida explícitamente... tiene que quedar
// accesible desde un lugar, no invisible dentro del teléfono". Se llega acá
// desde el link chico del pie de INICIO (`screens/HomeScreen.tsx`, ya
// armado). Muestra cuánto hay guardado y ofrece exportar todo / borrar todo.
//
// La cola de feedback (sección 2.3) todavía no existe — es Fase 7 — así que
// hoy esta pantalla solo cuenta fichas. Cuando exista la cola, sumar acá su
// propio conteo (mismo patrón: exportar/borrar juntando las dos fuentes,
// sección 16: "sumar la cola de feedback a la pantalla de Datos y privacidad
// de la Fase 6, mismo exportar/borrar, ahora con las dos fuentes").

import { useEffect, useState } from 'react'
import { borrarTodasLasFichas, contarFichas, listarFichas } from '../data/db'
import { VersionFooter } from '../components/ui'

interface DatosPrivacidadScreenProps {
  readonly onBack: () => void
}

type BorrarState = 'idle' | 'confirmando' | 'borrando'

export function DatosPrivacidadScreen({ onBack }: DatosPrivacidadScreenProps) {
  const [fichasCount, setFichasCount] = useState<number | null>(null)
  const [countError, setCountError] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [borrarState, setBorrarState] = useState<BorrarState>('idle')
  const [borrarError, setBorrarError] = useState<string | null>(null)

  async function refreshCount() {
    try {
      setFichasCount(await contarFichas())
      setCountError(null)
    } catch (error) {
      setCountError(error instanceof Error ? error.message : 'No se pudo contar las fichas guardadas.')
    }
  }

  useEffect(() => {
    void refreshCount()
  }, [])

  async function handleExportar() {
    setExportError(null)
    try {
      const fichas = await listarFichas()
      const json = JSON.stringify(fichas, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const fecha = new Date().toISOString().slice(0, 10)
      const link = document.createElement('a')
      link.href = url
      link.download = `visagio-fichas-${fecha}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'No se pudo exportar. Probá de nuevo.')
    }
  }

  async function handleConfirmarBorrado() {
    setBorrarState('borrando')
    setBorrarError(null)
    try {
      await borrarTodasLasFichas()
      await refreshCount()
      setBorrarState('idle')
    } catch (error) {
      setBorrarError(error instanceof Error ? error.message : 'No se pudo borrar. Probá de nuevo.')
      setBorrarState('confirmando')
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center bg-neutral-950 px-4 pb-16 pt-8 text-neutral-50">
      <div className="flex w-full max-w-sm items-center">
        <button type="button" onClick={onBack} className="min-h-14 px-2 text-sm font-semibold text-neutral-300">
          ← Volver
        </button>
      </div>

      <h1 className="mt-2 w-full max-w-sm text-2xl font-semibold tracking-tight">Datos y privacidad</h1>
      <p className="mt-1 w-full max-w-sm text-sm text-neutral-400">
        Todo lo que la app guarda en este teléfono, con acceso para exportarlo o borrarlo cuando quieras.
      </p>

      <div className="mt-6 w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-200">
        <p className="mb-2 font-semibold text-neutral-100">Guardado en este teléfono</p>
        <dl className="grid grid-cols-[1fr_auto] gap-y-1">
          <dt className="text-neutral-400">Fichas de cliente</dt>
          <dd className="text-right font-semibold">{fichasCount ?? '…'}</dd>
        </dl>
        {/* Cola de feedback (sección 2.3): todavía no existe, es Fase 7. Cuando
            se implemente, agregar acá su propio renglón de conteo — no
            inventar un número vacío mientras tanto. */}
        {countError && <p className="mt-2 text-xs text-red-300">{countError}</p>}
      </div>

      <div className="mt-4 w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3">
        <p className="text-sm font-semibold text-neutral-100">Exportar todo</p>
        <p className="mt-1 text-xs text-neutral-500">
          Baja un archivo con todas las fichas de cliente, para guardarlo en Drive o mandárselo al desarrollador.
        </p>
        <button
          type="button"
          onClick={handleExportar}
          className="mt-3 min-h-14 w-full rounded-xl bg-lime-400 px-6 text-base font-semibold text-neutral-950 transition active:scale-[0.98]"
        >
          Exportar todo
        </button>
        {exportError && <p className="mt-2 text-xs text-red-300">{exportError}</p>}
      </div>

      <div className="mt-4 w-full max-w-sm rounded-xl border border-red-900 bg-neutral-900 px-4 py-3">
        <p className="text-sm font-semibold text-neutral-100">Borrar todo</p>
        <p className="mt-1 text-xs text-neutral-500">
          Borra todas las fichas de cliente de este teléfono. No se puede deshacer — exportá antes si no tenés
          respaldo.
        </p>

        {borrarState !== 'idle' ? (
          <div className="mt-3 rounded-xl border border-red-700 bg-red-950 px-4 py-3">
            <p className="text-sm font-semibold text-red-200">
              ¿Seguro que querés borrar TODAS las fichas? Esta acción no se puede deshacer.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setBorrarState('idle')}
                disabled={borrarState === 'borrando'}
                className="min-h-14 flex-1 rounded-xl border border-neutral-700 px-4 text-sm font-semibold text-neutral-300 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarBorrado}
                disabled={borrarState === 'borrando'}
                className="min-h-14 flex-1 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
              >
                {borrarState === 'borrando' ? 'Borrando…' : 'Sí, borrar todo'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setBorrarState('confirmando')}
            className="mt-3 min-h-14 w-full rounded-xl border border-red-700 px-6 text-base font-semibold text-red-400 transition active:scale-[0.98]"
          >
            Borrar todo
          </button>
        )}
        {borrarError && <p className="mt-2 text-xs text-red-300">{borrarError}</p>}
      </div>

      <VersionFooter />
    </div>
  )
}
