// Stub genérico para pantallas que todavía no existen (Fase 6a): "Buscar
// cliente" y "Datos y privacidad" van acá hasta que la Fase 6b las construya
// de verdad (búsqueda + historial la primera, exportar/borrar todo la
// segunda, sección 5). A propósito NO se implementa nada real todavía —
// el encargo de esta fase es explícito: dejarlas como acceso desde INICIO,
// no construirlas.

import { VersionFooter } from '../components/ui'

interface PlaceholderScreenProps {
  readonly title: string
  readonly message: string
  readonly onBack: () => void
}

export function PlaceholderScreen({ title, message, onBack }: PlaceholderScreenProps) {
  return (
    <div className="flex min-h-svh flex-col items-center bg-neutral-950 px-4 pb-16 pt-8 text-neutral-50">
      <div className="flex w-full max-w-sm items-center">
        <button type="button" onClick={onBack} className="min-h-14 px-2 text-sm font-semibold text-neutral-300">
          ← Volver
        </button>
      </div>

      <div className="mt-16 flex w-full max-w-sm flex-col items-center text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-neutral-400">{message}</p>
      </div>

      <VersionFooter />
    </div>
  )
}
