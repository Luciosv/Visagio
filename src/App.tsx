// Punto de entrada de navegación (sección 10 de CLAUDE.md). Router simple
// entre las cuatro pantallas de INICIO:
//
//   INICIO (`screens/HomeScreen.tsx`)
//    ├─ Buscar cliente     → `screens/BuscarClienteScreen.tsx` (Fase 6b):
//    │                        búsqueda por alias, ficha, historial, "Repetir
//    │                        el último" / "Ajustar"
//    ├─ Cliente nuevo      → `screens/NuevoClienteScreen.tsx`, el flujo
//    │                        completo de análisis + form + resultados
//    └─ Datos y privacidad → `screens/DatosPrivacidadScreen.tsx` (Fase 6b):
//                             cuánto hay guardado, exportar todo, borrar todo
//
// Estado de navegación simplísimo (un `useState` con la pantalla activa) a
// propósito: no hay historial de navegación real que mantener todavía (no
// hay deep-linking ni back del navegador que respetar), así que una librería
// de routing sería resolver un problema que no existe. Si en el futuro hace
// falta URL por pantalla, se agrega ahí.

import { useState } from 'react'
import { HomeScreen, type HomeDestination } from './screens/HomeScreen'
import { NuevoClienteScreen } from './screens/NuevoClienteScreen'
import { BuscarClienteScreen } from './screens/BuscarClienteScreen'
import { DatosPrivacidadScreen } from './screens/DatosPrivacidadScreen'

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
      return <BuscarClienteScreen onExit={goHome} />
    case 'datos-privacidad':
      return <DatosPrivacidadScreen onBack={goHome} />
    case 'inicio':
    default:
      return <HomeScreen onNavigate={setScreen} />
  }
}

export default App
