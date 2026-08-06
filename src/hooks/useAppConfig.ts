// Hook compartido para cargar `config.json` (sección 6 de CLAUDE.md: "feature
// flags... un config.json chico al lado de cuts.json"). Extraído en la Fase
// 6b de `NuevoClienteScreen.tsx` por la misma razón que `useCuts.ts`:
// `screens/BuscarClienteScreen.tsx` también necesita `mostrarDebug` y
// `nombreBarberia` (esta última la usa `shareCard.ts` al armar la ficha
// compartible desde "Repetir el último"/"Ajustar").

import { useEffect, useState } from 'react'
import type { AppConfig } from '../types'

/** Default seguro mientras `config.json` todavía no cargó (o si falla): sin debug, que es lo que tiene que ver el barbero (sección 6). */
export const DEFAULT_APP_CONFIG: AppConfig = { mostrarDebug: false, nombreBarberia: '' }

/** Carga `config.json` una sola vez al montar. Arranca en `DEFAULT_APP_CONFIG` hasta que llegue la respuesta. */
export function useAppConfig(): AppConfig {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG)

  useEffect(() => {
    let cancelled = false
    // Conveniencia solo para desarrollo local: `?debug=1` en la URL fuerza
    // `mostrarDebug: true` sin tener que editar `config.json` a mano.
    const forceDebug = new URLSearchParams(window.location.search).get('debug') === '1'
    fetch('/data/config.json')
      .then((response) => {
        if (!response.ok) throw new Error('No se pudo cargar la configuración.')
        return response.json() as Promise<AppConfig>
      })
      .then((data) => {
        if (!cancelled) setConfig({ ...data, mostrarDebug: data.mostrarDebug || forceDebug })
      })
      .catch(() => {
        if (!cancelled && forceDebug) setConfig({ ...DEFAULT_APP_CONFIG, mostrarDebug: true })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return config
}
