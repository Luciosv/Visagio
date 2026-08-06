// Punto de entrada de navegación (sección 10 de CLAUDE.md). Hasta la Fase 6a
// `App.tsx` ERA el flujo de "cliente nuevo" completo, arrancando directo en
// pedir la foto — no existía ninguna pantalla de inicio. Ahora es un router
// simple entre las cuatro pantallas de INICIO:
//
//   INICIO (`screens/HomeScreen.tsx`)
//    ├─ Buscar cliente     → stub (`screens/PlaceholderScreen.tsx`, lo
//    │                        construye la Fase 6b)
//    ├─ Cliente nuevo      → `screens/NuevoClienteScreen.tsx`, el flujo que
//    │                        ya existía, sin cambios de lógica
//    └─ Datos y privacidad → stub (`screens/PlaceholderScreen.tsx`, lo
//                             construye la Fase 6b)
//
// Estado de navegación simplísimo (un `useState` con la pantalla activa) a
// propósito: no hay historial de navegación real que mantener todavía (no
// hay deep-linking ni back del navegador que respetar), así que una librería
// de routing sería resolver un problema que no existe. Si en el futuro hace
// falta URL por pantalla, se agrega ahí.

import { useState } from 'react'
import { HomeScreen, type HomeDestination } from './screens/HomeScreen'
import { NuevoClienteScreen } from './screens/NuevoClienteScreen'
import { PlaceholderScreen } from './screens/PlaceholderScreen'

type Screen = 'inicio' | HomeDestination

function App() {
  const [screen, setScreen] = useState<Screen>('inicio')

  function goHome() {
    setScreen('inicio')
  }

  switch (screen) {
    case 'cliente-nuevo':
      return <NuevoClienteScreen onExit={goHome} />
    case 'buscar-cliente':
      return (
        <PlaceholderScreen
          title="Buscador — próximamente"
          message="Acá va a ir la ficha del cliente: historial, morfología y repetir el último corte en un par de taps. Todavía no está construido."
          onBack={goHome}
        />
      )
    case 'datos-privacidad':
      return (
        <PlaceholderScreen
          title="Datos y privacidad — próximamente"
          message="Acá vas a poder ver cuántas fichas y eventos hay guardados, exportar todo o borrar todo. Todavía no está construido."
          onBack={goHome}
        />
      )
    case 'inicio':
    default:
      return <HomeScreen onNavigate={setScreen} />
  }
}

export default App
