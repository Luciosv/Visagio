// Hook compartido para cargar `cuts.seed.json` (sección 6 de CLAUDE.md: "los
// datos separados del código... se pide en runtime con fetch, no se importa
// en el bundle"). Extraído en la Fase 6b de `NuevoClienteScreen.tsx` porque
// `screens/BuscarClienteScreen.tsx` (flujo de "cliente que vuelve", ruta
// "Ajustar") necesita la misma base de cortes para volver a correr
// `recommendCuts` — misma lógica de carga, dos consumidores.

import { useEffect, useState } from 'react'
import type { Cut } from '../types'

export interface UseCutsResult {
  readonly cuts: readonly Cut[] | null
  readonly cutsError: string | null
}

/** Carga `cuts.seed.json` una sola vez al montar. `cuts` es `null` mientras está en curso. */
export function useCuts(): UseCutsResult {
  const [cuts, setCuts] = useState<readonly Cut[] | null>(null)
  const [cutsError, setCutsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/data/cuts.seed.json')
      .then((response) => {
        if (!response.ok) throw new Error('No se pudo cargar la base de cortes.')
        return response.json() as Promise<Cut[]>
      })
      .then((data) => {
        if (!cancelled) setCuts(data)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCutsError(error instanceof Error ? error.message : 'No se pudo cargar la base de cortes.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { cuts, cutsError }
}
