// Pantalla INICIO (Fase 6a, sección 10 de CLAUDE.md). Hasta esta fase la app
// arrancaba directo en el flujo de "cliente nuevo" (no existía ninguna
// pantalla de inicio); esta es la primera vez que aparece el árbol completo
// de la sección 10:
//
//   INICIO
//    ├─ [Buscar cliente]   ← ruta principal (90% del uso, sección 5)
//    ├─ [Cliente nuevo]    ← flujo completo de análisis
//    └─ "Datos y privacidad" ← al pie, al lado de la versión
//
// Rediseño (Fase A): esta es la pantalla "cara" del sistema (frontend-design:
// "el hero es una tesis"). Marca en display condensado tipo cartel de
// barbería (Oswald), con una regla de latón como elemento de firma. Usa los
// tokens de `src/styles/theme.css`, nunca colores crudos.

export type HomeDestination = 'buscar-cliente' | 'cliente-nuevo' | 'datos-privacidad'

interface HomeScreenProps {
  readonly onNavigate: (destination: HomeDestination) => void
}

export function HomeScreen({ onNavigate }: HomeScreenProps) {
  return (
    <div className="flex min-h-svh flex-col items-center bg-app px-4 pt-16 text-ink">
      {/* Marca: wordmark en display condensado + regla de latón (firma). */}
      <header className="flex flex-col items-center">
        <h1 className="font-display text-5xl font-semibold uppercase tracking-[0.2em] text-ink">
          Visagio
        </h1>
        <span className="mt-3 h-px w-16 bg-accent" aria-hidden />
        <p className="mt-3 text-sm tracking-wide text-ink-muted">
          Asistente de visagismo para barbería
        </p>
      </header>

      <div className="mt-12 flex w-full max-w-sm flex-col gap-3">
        <button
          type="button"
          onClick={() => onNavigate('cliente-nuevo')}
          className="min-h-14 w-full rounded-xl bg-accent px-6 py-4 text-left transition active:scale-[0.98]"
        >
          <span className="font-display text-xl font-semibold uppercase tracking-wide text-on-accent">
            Cliente nuevo
          </span>
          <span className="mt-0.5 block text-xs font-medium text-on-accent/70">
            Foto, forma de cara y recomendación completa
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('buscar-cliente')}
          className="min-h-14 w-full rounded-xl border border-line bg-surface px-6 py-4 text-left transition active:scale-[0.98] hover:border-accent"
        >
          <span className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
            Buscar cliente
          </span>
          <span className="mt-0.5 block text-xs font-medium text-ink-muted">
            Ver ficha, historial y repetir el último corte
          </span>
        </button>
      </div>

      {/* Pie en el flujo (no `fixed`): "Datos y privacidad" chico AL LADO de la
          versión (sección 10). `mt-auto` lo pega abajo sin taparlo con nada. */}
      <footer className="mt-auto flex items-center justify-center gap-3 pt-8 pb-4 text-xs text-ink-faint">
        <button
          type="button"
          onClick={() => onNavigate('datos-privacidad')}
          className="min-h-11 px-2 underline underline-offset-2"
        >
          Datos y privacidad
        </button>
        <span aria-hidden>·</span>
        <span>v{__APP_VERSION__}</span>
      </footer>
    </div>
  )
}
