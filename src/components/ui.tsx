// Piezas de UI compartidas entre pantallas (sección 17: reutilización antes
// que copiar y pegar). Extraídas de lo que antes vivía todo en `App.tsx`
// cuando la app era un único flujo (Fase 6a: se partió `App.tsx` en
// pantallas — ver `src/screens/`).
//
// Rediseño (Fase A): estas piezas usan las clases de componente y los tokens
// semánticos de `src/styles/theme.css` (`.chip`, `text-ink-*`), nunca colores
// crudos de Tailwind — así cambiar de tema es editar un solo archivo.

import type { ReactNode } from 'react'

/**
 * `v0.4.2` chico en el pie de pantalla (sección 6: "número de versión visible").
 * Lo muestran todas las pantallas de la app.
 *
 * EN EL FLUJO del documento (no `fixed`): pegado abajo con `mt-auto` dentro de
 * la columna `min-h-svh` de cada pantalla. Antes era `position: fixed` y tapaba
 * contenido real (el botón de compartir, el input de alias, los chips de
 * descarte) cuando la pantalla scrolleaba.
 */
export function VersionFooter() {
  return (
    <footer className="mt-auto w-full pt-8 pb-4 text-center text-xs text-ink-faint">
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
      className={'chip' + (capitalize ? ' capitalize' : '')}
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
    <div className="mt-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
