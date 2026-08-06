# Handoff para la sesión de UI/UX

> Este documento es un complemento, no un reemplazo de `CLAUDE.md`. Leé
> `CLAUDE.md` completo primero (es la regla del propio repo, sección 18) —
> ahí está el *por qué* de cada decisión de producto. Esto de acá es solo
> para no perder tiempo re-descubriendo el estado del código a fuerza de
> grep. Fecha de este snapshot: la sesión que cerró la Fase 7 (parcial).

## 1. Qué está hecho

El flujo funcional completo del MVP anda de punta a punta y fue probado a
mano en Android e iPhone reales:

- **Fases 0-5** (visión, métricas, clasificación de forma, motor de
  recomendación, resultados y compartir): completas.
- **Fase 6** (ficha de cliente): completa. IndexedDB con esquema
  versionado (`DB_VERSION = 2`), pantalla de inicio, buscador, historial,
  "repetir el último" / "ajustar".
- **Fase 7**: **solo los puntos 1-3** de la sección 16 de `CLAUDE.md` — cola
  de feedback local, botón 👎 con motivos, y sumar esa cola a "Datos y
  privacidad". **Los puntos 4 (pulido mobile, sesión con el barbero para
  verificar los 15 cortes, enseñarle a instalar la app) quedaron
  explícitamente afuera a pedido del usuario** — es justamente el trabajo
  que arranca esta sesión.

Todo lo demás (Fase 8 sincronización con backend, Fase 9 service worker
offline) es v1.1, no tocar sin que se pida.

## 2. Mapa de archivos

```
src/
  App.tsx                        Router mínimo entre pantallas (useState<Screen>)
  types.ts                       Fuente de verdad de todos los tipos (sección 17: nada de `any`)

  screens/
    HomeScreen.tsx                INICIO: Buscar cliente / Cliente nuevo / (pie) Datos y privacidad
    NuevoClienteScreen.tsx        Flujo completo: foto → gate calidad → nacimiento → forma → form 5 taps → ResultsScreen
    BuscarClienteScreen.tsx       Buscador por alias → ficha/historial → "repetir el último" / "ajustar"
    ResultsScreen.tsx             ResultsScreen + CutCard + CutDetailScreen (compartidos entre los dos flujos de arriba)
    DatosPrivacidadScreen.tsx     Conteo/export/borrado de fichas + eventos de feedback

  components/
    ui.tsx                        VersionFooter, Chip, ChipGroupSection (compartidos)
    BarberForm.tsx                El form de 5 taps (textura/densidad/flags/minutos/largo actual)

  vision/                         Funciones puras (sección 17: "entran números, salen números, nada de DOM")
    faceLandmarker.ts              Carga de MediaPipe FaceLandmarker (self-hosted, GPU con fallback a CPU)
    quality.ts + qualityThresholds.ts   Gate de calidad (pose/tamaño/nitidez), umbrales comentados
    metrics.ts                     R1-R6 a partir de landmarks + punto de nacimiento
    faceShape.ts + faceShapeThresholds.ts   Clasificación difusa top-2 + override del barbero
    landmarkIndices.ts             Índices de landmark + grupos de color del overlay de debug
    overlay.ts                     Dibuja la malla de 478 puntos sobre el canvas (SIEMPRE visible, no es debug)
    imageProcessing.ts             Resize a 1024px, rotación por roll, recorte en escala de grises
    debugHook.ts                   Hook DEV-only para inspeccionar la última detección

  engine/                         Motor de recomendación, también funciones puras
    recommend.ts + recommendWeights.ts   Scoring (sección 9) + "camino en 2-3 cortes"
    explain.ts                     Frase de "por qué" de cada recomendación
    largoActualArribaThresholds.ts Buckets de cm del 5to tap
    shareCard.ts                   Contenido de la ficha compartible (nunca foto/IA/%, ver comentario del archivo)
    feedback.ts                    Arma el EventoFeedback de la sección 2.3 (mismo criterio defensivo que shareCard.ts)

  data/
    db.ts                          IndexedDB (`idb`): stores `fichas` y `eventosFeedback`, migraciones en `upgrade`
    sesionId.ts                    UUID anónimo de dispositivo, en localStorage

  hooks/
    useCuts.ts / useAppConfig.ts   fetch runtime de cuts.seed.json / config.json (NUNCA importados al bundle)

  shareImage.ts                    Genera el PNG (canvas) y llama a Web Share API / fallback de descarga

public/
  data/cuts.seed.json              15 cortes, TODOS con "verificado": false todavía
  data/config.json                 { mostrarDebug, nombreBarberia } — sin pantalla de ajustes para editarlo aún
  cuts/                            SVGs placeholder (no las fotos de maniquí reales de la sección 15 todavía)
  models/                          Modelo .task + wasm de MediaPipe, self-hosted
```

## 3. Deuda de UI/UX conocida (esto es lo que probablemente vas a tocar)

Todo lo de acá es intencional-por-ahora, no son bugs — quedaron así porque
el foco de las fases anteriores fue "que funcione", no "que se vea bien".

- **Colores y estética en general**: hoy es Tailwind por defecto sin
  dirección de diseño (`neutral-950` de fondo, acentos `lime`/`sky`/`amber`
  elegidos ad hoc por cada agente, sin sistema). Esto es lo primero que
  mencionó el usuario que quiere revisar.
- **El overlay de la malla de puntos sobre la foto se queda siempre
  visible** — decisión de producto ya tomada (no es debug, da sensación
  profesional). Ver sección 10 de `CLAUDE.md`, actualizada con esto.
- **Los paneles numéricos** (yaw/pitch/roll, ratios R1-R6 crudos,
  calibración de nacimiento) están detrás de `config.json.mostrarDebug`
  (default `false`) y de un query param de conveniencia `?debug=1`. No los
  saques de ahí sin razón — son para desarrollo, no para el barbero.
- **El handle de línea de nacimiento** ya pasó por una ronda de UX (línea
  punteada, desfasaje dedo-línea, franja de agarre en vez de toda la foto)
  pero el usuario dijo explícitamente que iba a querer revisarlo de nuevo
  con más profundidad en esta sesión.
- **"Ajustar" (cliente que vuelve)** solo precarga los chips de
  implantación/restricciones en el form de 5 taps; textura, densidad y
  largo actual arrancan en blanco porque `ClienteFicha` no los persiste de
  la visita anterior. El usuario no confirmó explícitamente si eso le
  sirve así — vale la pena preguntarlo o revisarlo.
- **`nombreBarberia`** es un string fijo en `config.json` sin ninguna
  pantalla para editarlo. Si se arma una pantalla de ajustes, es el primer
  candidato a vivir ahí.
- **`ClienteFicha.fotoReferencia`** está tipado (`Blob` opcional) pero sin
  ninguna UI de carga ni el checkbox de consentimiento que pide la sección
  5/14 — si se construye, el consentimiento explícito no es opcional.
- **Maniquíes son SVG placeholder genéricos**, no las fotos reales de la
  sección 15. Reemplazarlos es una tarea de assets, no de código, y tiene
  un costo real (sección 15) — no generarlos sin que el usuario lo pida.
- **Caso sin resolver**: si el barbero descarta todo y arranca una foto
  nueva sin tocar nunca "Este hice", ese feedback negativo se pierde (no
  hay un gancho de "cerrar consulta" separado). Bajo impacto, mencionado
  por si aparece al revisar el flujo de resultados.
- **Los 15 cortes siguen `verificado: false`** — la sesión de corregirlos
  con el barbero real (Fase 7, punto 4) todavía no pasó. No es un problema
  de UI, pero el badge "Sin verificar" en las cards depende de esto y va a
  seguir apareciendo hasta esa sesión.
- **Sin PDF** (sección 2.2 lo marca como secundario, no MVP) y **sin
  service worker / instalación guiada** (Fase 9, v1.1) — no agregar sin
  que se pida, sección 18: "no agregar nada de la lista de fuera de
  alcance sin preguntar".

## 4. Reglas de UI que ya son no-negociables (sección 10 de CLAUDE.md)

- Targets de 56px mínimo, todo alcanzable con el pulgar.
- Alto contraste (la barbería tiene luz fuerte y espejos).
- Nada de scroll horizontal, nada de hover, nada de menús anidados.
- Todo el texto en español rioplatense con voseo.
- El presupuesto de tiempo real es 30-60s con cliente conocido, ~2 min con
  uno nuevo (sección 1) — cualquier cambio de UX se juzga contra ese
  número, no contra "se ve mejor".

## 5. Cómo correr y probar

- `npm run dev` local, o `dev-tunnel.bat` / `preview-tunnel.bat` para
  probar desde el celular (túnel de Cloudflare, no depende de estar en la
  misma red WiFi — la del usuario aísla clientes).
- **Usar `preview-tunnel.bat` para cualquier prueba de varios pasos**: el
  modo dev pierde estado a mitad de sesión cuando el WebSocket de HMR se
  corta sobre el túnel (bug conocido, ver `dev-tunnel.bat` vs
  `preview-tunnel.bat`). `dev-tunnel.bat` sirve solo para chequeos rápidos
  de un solo paso.
- Para tests automatizados (Playwright vía el skill `webapp-testing`) sin
  depender de una cámara real: `window.__visagioInjectRatiosForTesting`
  (definido en `src/vision/debugHook.ts` y usado en `NuevoClienteScreen`)
  permite saltear MediaPipe e inyectar landmarks/ratios directo.
- `npm test` (Vitest) para la lógica pura — 97 tests hoy, todos deberían
  seguir pasando después de cambios puramente visuales.

## 6. Skill de diseño disponible

Este repo ya tiene instalado el skill **`ui-ux-pro-max`** (estilos, paletas,
tipografías, guías de UX, iconos, motion, charts). Es el punto de partida
lógico para la sección 3 de este doc (colores/estética) — mejor invocarlo
antes de elegir una paleta o un sistema de espaciado a mano.

## 7. Convenciones de trabajo de esta sesión

- Los commits en este repo van **sin** línea `Co-Authored-By` (preferencia
  explícita del usuario, a diferencia del default).
- Se trabaja directo sobre `main` hasta que exista una versión entregable;
  ahí el usuario dijo que va a abrir una rama aparte para no romper la app
  en cada cambio — no asumas que ya existe esa rama.
- El patrón que funcionó bien en todas las fases anteriores: proponer el
  alcance antes de tocar código (sección 18 de `CLAUDE.md`), delegar la
  implementación a un subagente (`model: sonnet`) con instrucciones bien
  acotadas y con los archivos exactos a tocar, verificar build+tests+
  Playwright antes de dar por cerrado cada paso.
