// Piezas de UI compartidas entre pantallas (sección 17: reutilización antes
// que copiar y pegar). Extraídas de lo que antes vivía todo en `App.tsx`
// cuando la app era un único flujo (Fase 6a: se partió `App.tsx` en
// pantallas — ver `src/screens/`).

import type { ReactNode } from 'react'

/** `v0.4.2` chico en el pie de pantalla (sección 6: "número de versión visible"). Lo muestran todas las pantallas de la app. */
export function VersionFooter() {
  return (
    <footer className="fixed inset-x-0 bottom-0 py-3 text-center text-xs text-neutral-500">
      v{__APP_VERSION__}
    </footer>
  )
}

/** Botón grande de chip, targets de 56px (sección 10). `capitalize` es para reusar etiquetas redactadas en minúscula (ej. las de `explain.ts`) como texto de botón. */
interface ChipProps {
  readonly label: string
  readonly selected: boolean
  readonly onClick: () => void
  readonly capitalize?: boolean
}

export function Chip({ label, selected, onClick, capitalize = false }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        'min-h-14 rounded-xl border px-4 text-sm font-semibold transition active:scale-[0.98] ' +
        (capitalize ? 'capitalize ' : '') +
        (selected
          ? 'border-lime-400 bg-lime-400 text-neutral-950'
          : 'border-neutral-700 bg-neutral-800 text-neutral-200')
      }
    >
      {label}
    </button>
  )
}

interface ChipGroupSectionProps {
  readonly title: string
  readonly children: ReactNode
}

export function ChipGroupSection({ title, children }: ChipGroupSectionProps) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
