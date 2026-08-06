// Pantalla INICIO (Fase 6a, sección 10 de CLAUDE.md). Hasta esta fase la app
// arrancaba directo en el flujo de "cliente nuevo" (no existía ninguna
// pantalla de inicio); esta es la primera vez que aparece el árbol completo
// de la sección 10:
//
//   INICIO
//    ├─ [Buscar cliente]   ← stub, lo construye la Fase 6b (búsqueda +
//    │                        historial)
//    ├─ [Cliente nuevo]    ← flujo YA EXISTENTE, sin tocarle la lógica
//    │                        interna (`screens/NuevoClienteScreen.tsx`)
//    └─ "Datos y privacidad" ← stub, lo construye la Fase 6b (cuánto hay
//                               guardado, exportar todo, borrar todo)
//
// "Buscar cliente" es la ruta principal (90% del uso real, sección 5), pero
// TODAVÍA no tiene nada atrás: se muestra igual, arriba y primero, para que
// el layout ya quede armado como va a quedar cuando el otro agente la
// implemente — no se le da menos jerarquía visual solo porque hoy es un
// stub.

export type HomeDestination = 'buscar-cliente' | 'cliente-nuevo' | 'datos-privacidad'

interface HomeScreenProps {
  readonly onNavigate: (destination: HomeDestination) => void
}

export function HomeScreen({ onNavigate }: HomeScreenProps) {
  return (
    <div className="flex min-h-svh flex-col items-center bg-neutral-950 px-4 pb-16 pt-12 text-neutral-50">
      <h1 className="text-3xl font-semibold tracking-tight">Visagio</h1>
      <p className="mt-1 text-sm text-neutral-400">Asistente de visagismo para barbería</p>

      <div className="mt-10 flex w-full max-w-sm flex-col gap-3">
        <button
          type="button"
          onClick={() => onNavigate('buscar-cliente')}
          className="min-h-14 w-full rounded-xl border border-neutral-700 bg-neutral-900 px-6 text-left text-lg font-semibold text-neutral-50 transition active:scale-[0.98]"
        >
          Buscar cliente
          <span className="mt-0.5 block text-xs font-normal text-neutral-500">
            Ver ficha, historial y repetir el último corte
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('cliente-nuevo')}
          className="min-h-14 w-full rounded-xl bg-lime-400 px-6 text-left text-lg font-semibold text-neutral-950 transition active:scale-[0.98]"
        >
          Cliente nuevo
          <span className="mt-0.5 block text-xs font-normal text-neutral-950/70">
            Foto, forma de cara y recomendación completa
          </span>
        </button>
      </div>

      {/* Pie, chico, con "Datos y privacidad" AL LADO de la versión (sección
          10: "no un botón grande en el flujo principal — pensarlo al lado
          del número de versión"). Por eso esta pantalla arma su propio pie
          en vez de reusar `VersionFooter` a secas: es la única que necesita
          este link. */}
      <footer className="fixed inset-x-0 bottom-0 flex items-center justify-center gap-3 py-3 text-xs text-neutral-500">
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
