# Plan de rediseño UI/UX — Visagio

> Complemento de `CLAUDE.md` y `HANDOFF_UIUX.md`. Leer ambos antes de tocar
> código (regla del repo, sección 18 de CLAUDE.md). Este plan sale del
> diagnóstico de UI/UX de la sesión de rediseño y de dos decisiones de
> producto ya tomadas por el usuario en esa sesión:
>
> 1. **Identidad visual: Dirección A — "Barbería" (carbón + latón).**
> 2. **Ficha compartible: solo la info del cliente** (se saca la spec de
>    máquina del PNG — esto **cambia CLAUDE.md 2.2**, ver Fase F).
>
> Requisito transversal del usuario: **los tokens de tema van en un solo
> archivo**, para poder cambiar de paleta/estilo sin tocar 7 pantallas.

---

## 0. Reglas de trabajo (para todos los agentes)

- **Rama:** antes de empezar, crear `rediseno-ui` desde `main`. Este rediseño
  rompe cosas a mitad de camino; no se trabaja sobre `main` (handoff 7).
- **Commits sin `Co-Authored-By`** (preferencia explícita del repo).
- **No tocar la lógica de dominio** (`vision/`, `engine/`, `recommend`,
  `metrics`, `faceShape`, umbrales) salvo donde el plan lo pida
  explícitamente (Fase E-explain, Fase F-share, Fase G-datos). Esto es un
  rediseño visual + tres cambios de contenido acotados.
- **Respetar las dos decisiones de producto ya cerradas de CLAUDE.md 10:** el
  overlay de la malla queda visible (no es debug); los paneles numéricos
  (yaw/pitch/ratios crudos) siguen detrás de `mostrarDebug`.
- **Definición de "terminado" por fase:** `npm run build` sin errores +
  `npm test` verde (97 tests hoy; actualizar los que correspondan si la fase
  toca engine/data) + captura de Playwright de las pantallas afectadas para
  revisión visual. El flujo de cliente nuevo se puede saltear con
  `window.__visagioInjectRatiosForTesting` (handoff 5); sembrar una ficha en
  IndexedDB para las pantallas de "Buscar cliente" (ver el script de la
  sesión de diagnóstico como referencia).
- **Presupuesto de 30-60s manda:** cada cambio se juzga contra el tiempo de
  consulta, no contra "se ve mejor" (CLAUDE.md 1).
- **No `any`; tipos en `src/types.ts`** (CLAUDE.md 17).

Orden y dependencias:

```
A (tokens+fuentes+primitivas)  ← BLOQUEA a todo lo demás
   ├─ B (Inicio + Cliente nuevo + form + malla)
   ├─ C (Resultados + detalle)
   ├─ D (Buscar + ficha + ajustar + Datos y privacidad)
   ├─ E (motor: explain.ts, wording)          ← engine, independiente de A
   ├─ F (ficha compartible PNG, solo-cliente) ← usa tokens de A
   └─ G (persistir form en la ficha → Ajustar precarga) ← data, independiente de A
```

B, C, D tocan archivos disjuntos entre sí (ver cada fase) y pueden ir en
paralelo una vez cerrada A. E y G son de lógica y no dependen de A. F depende
de los valores de color de A.

---

## Fase A — Fundaciones de diseño (tokens + fuentes + primitivas)

**Objetivo:** un sistema de diseño en **un solo archivo de tema**, más las
piezas compartidas restyleadas, para que B/C/D/F solo consuman clases y nunca
elijan un color a mano.

**Archivos:**
- `src/styles/theme.css` (nuevo) — único lugar con la paleta y la tipografía.
- `src/index.css` — importar `theme.css` y las fuentes.
- `src/components/ui.tsx` — `Chip`, `ChipGroupSection`, `VersionFooter`.
- `package.json` — `@fontsource/oswald` y `@fontsource/inter` (self-host, sin
  CDN — CLAUDE.md 6). Importarlas en `index.css`.

**Qué hacer:**

1. **Fuentes self-host.** Agregar `@fontsource/oswald` (500/600) e
   `@fontsource/inter` (400/500/600) como dependencias e importarlas en
   `index.css`. Nada de `fonts.googleapis.com` en runtime.

2. **`theme.css` — tokens semánticos de Tailwind v4** vía `@theme`, con la
   paleta Dirección A. Estos nombres son la API que usa el resto de la app
   (`bg-app`, `text-ink`, `bg-accent`, etc.). **Cambiar de tema = editar solo
   este bloque.** Dejar un comentario arriba explicando eso y cómo estaba la
   Dirección B/C por si se quiere volver.

   ```css
   @theme {
     /* ---- Dirección A: Barbería (carbón + latón) ---- */
     --color-app: #17140F;          /* fondo de la app */
     --color-surface: #211B12;      /* panel / card */
     --color-surface-2: #2C2318;    /* chip sin seleccionar / panel elevado */
     --color-line: #3A3020;         /* bordes sutiles */
     --color-ink: #F5EFE4;          /* texto primario (crema) */
     --color-ink-muted: #B8AE9C;    /* secundario — reemplaza neutral-500 */
     --color-ink-faint: #8A8172;    /* terciario, usar poco */
     --color-accent: #C8952F;       /* latón — acción primaria (fill) */
     --color-accent-strong: #B5842A;/* hover/press del latón */
     --color-accent-ink: #E0B25A;   /* latón como TEXTO sobre fondo oscuro (≥4.5:1) */
     --color-on-accent: #17140F;    /* texto sobre botón latón */
     --color-select: #3A6B5E;       /* verde profundo — estado seleccionado */
     --color-on-select: #F5EFE4;
     --color-danger: #C0442E;       /* rojo barbero */
     --color-danger-surface: #2A1512;

     --font-display: "Oswald", system-ui, sans-serif;
     --font-body: "Inter", system-ui, sans-serif;
   }
   ```

   Notas de contraste (validar con las capturas): `ink` y `ink-muted` sobre
   `app` quedan muy por encima de 4.5:1. Para **texto de color latón** sobre
   fondo oscuro usar `accent-ink` (#E0B25A), no `accent` (#C8952F, queda
   justo). El botón latón lleva texto `on-accent` (carbón), como un cartel de
   bronce.

3. **Capa de componentes** (`@layer components` en `theme.css`), para que los
   botones/paneles/chips sean una clase y no 8 utilidades repetidas:
   - `.panel` → `bg-surface border border-line rounded-xl`.
   - `.btn` base (min-h 56px = `min-h-14`, `rounded-xl`, `font-semibold`,
     `active:scale-[0.98]`, foco visible).
   - `.btn-primary` (fill latón + texto carbón), `.btn-secondary` (outline
     `border-line` + texto crema), `.btn-danger` (outline rojo), `.btn-ghost`.
   - `.chip` y `.chip--selected` (selected = `bg-select text-on-select`).
   - Título display: usar `font-display` en H1/H2 y nombres de corte; body en
     el resto.

4. **`ui.tsx`:**
   - `Chip` / `ChipGroupSection` → usar las clases nuevas. En seleccionado,
     verde profundo (`bg-select`), **no** el mismo color que la acción
     primaria (así "seleccionado" ≠ "botón de acción", que hoy son ambos
     lima).
   - **`VersionFooter`: sacar `fixed inset-x-0 bottom-0`** y hacerlo un footer
     **en el flujo** del documento (al final de la columna, `mt-auto`). Hoy el
     `fixed` tapa contenido real (el botón "Compartir al cliente", el input de
     alias, los chips de descarte). Este es el fix del footer flotante. Hacer
     lo mismo con el footer propio de `HomeScreen` (el que lleva el link
     "Datos y privacidad"): en flujo, pegado abajo con `mt-auto`.

**Terminado cuando:** build + tests verdes, y una captura de INICIO ya con la
paleta A y sin el footer pisando nada. Documentar en el propio `theme.css`
cómo cambiar de tema.

---

## Fase B — Inicio + Cliente nuevo + form + malla

**Objetivo:** aplicar el sistema al camino de "cliente nuevo" (el de ~2 min) y
bajarle el ruido, más simplificar la malla.

**Archivos:** `src/screens/HomeScreen.tsx`, `src/screens/NuevoClienteScreen.tsx`,
`src/components/BarberForm.tsx`, `src/vision/overlay.ts`.

**Qué hacer:**

1. **HomeScreen:** aplicar tokens/primitivas. Título "Visagio" en `font-display`.
   "Cliente nuevo" = `btn-primary` (latón); "Buscar cliente" = `btn-secondary`
   (es la ruta del 90% del uso, pero es una consulta *rápida*, no la de
   captura — dejarla clara pero no gritando; la jerarquía de color ya la
   distingue de un stub). Mantener "Datos y privacidad" chico al pie
   (CLAUDE.md 10).

2. **NuevoClienteScreen (chrome):** tokens en botones/paneles/mensajes de
   calidad. El mensaje de calidad OK/rechazo con `bg-select`/`bg-danger-surface`
   en vez de lime/amber.

3. **Estado vacío de la foto (hallazgo #10):** hoy antes de sacar la foto hay
   un rectángulo gris mudo. Poner adentro una guía corta de encuadre (CLAUDE.md
   12.4): "Foto de frente, a ~1,5 m, con la cámara de atrás. Que mire derecho a
   la cámara." Una o dos líneas, no un párrafo.

4. **Handle de nacimiento (hallazgo #9):** el gesto ya está bien resuelto (no
   tocar la mecánica: offset, franja de agarre, X bloqueado). **Acortar la
   instrucción** de 4 líneas a una: "Arrastrá la línea hasta donde arranca el
   pelo." La explicación larga del "por qué la línea aparece arriba del dedo"
   se puede mostrar solo la primera vez o mandarla a un `title`/detalle chico.

5. **Form de 5 taps (hallazgo #3) — `BarberForm.tsx`:**
   - **Sacar la numeración "1 / 2 / 3 / 4a / 4b / 5"** de los títulos: numerar
     no aporta (el orden no significa nada para el barbero) y mete ruido.
     Títulos por lo que son: "Textura", "Densidad", "Implantación (opcional)",
     "Restricciones (opcional)", "Minutos que se peina", "Largo actual arriba".
   - Aplicar `.chip`. Targets 56px (ya están).
   - Dar sensación de avance sin cronometrar de más: separar visualmente las
     dos secciones obligatorias (textura/densidad/minutos/largo) de las
     opcionales (implantación/restricciones), y que el botón "Ver
     recomendaciones" comunique qué falta si está deshabilitado (ej. subtítulo
     "Elegí textura, densidad, minutos y largo"). No convertirlo en wizard de
     varios pasos: sigue siendo una vista, pero legible y con jerarquía.
   - **Contraste (hallazgo #5):** los `text-neutral-500` pasan a `text-ink-muted`;
     el helper de arriba también.

6. **Malla (`overlay.ts`) — simplificar (decisión de la sesión):**
   - **Los 9 grupos de puntos de colores** (mentón rojo, bicigomático amarillo,
     gonion, iris, cejas, etc.) hoy se dibujan **siempre**, pero su leyenda
     está detrás de `mostrarDebug`: quedan puntos de colores sin explicación
     sobre la cara del cliente. **Moverlos detrás de `mostrarDebug`** (son una
     ayuda de validación de landmarks, justo para lo que existe el flag). Para
     eso, `drawLandmarksOverlay` necesita recibir un parámetro
     `mostrarDebug: boolean` (o dividir en `drawMesh` + `drawDebugLandmarks`),
     y `NuevoClienteScreen` le pasa `config.mostrarDebug`.
   - **La malla de 478 puntos queda siempre** (CLAUDE.md 10), pero refinada:
     puntos más chicos y sutiles, en un color de la paleta (crema tenue o
     latón a baja opacidad) en vez del lima 0.8. Objetivo: que se lea como
     "tecnología de análisis", prolijo, no como salpicadura.
   - *(Opcional, no base):* dibujar la teselación como líneas finas en vez de
     nube de puntos se ve más "face-scan"; dejarlo anotado como mejora futura,
     no hacerlo en esta fase salvo que sobre tiempo.

**Terminado cuando:** build + tests verdes; capturas de INICIO, cliente nuevo
(vacío + con análisis inyectado + form), y de la malla con y sin
`mostrarDebug`.

---

## Fase C — Resultados + detalle

**Objetivo:** resolver el hallazgo #1 (la pantalla de decisión, contra reloj):
hoy las 5 cards pesan igual y el "porqué" se lee casi idéntico. Que se pueda
**escanear**, no leer.

**Archivos:** `src/screens/ResultsScreen.tsx` (incluye `CutCard` y
`CutDetailScreen`).

**Qué hacer:**

1. **Jerarquía de ranking en las cards (#1):**
   - Destacar el **top-1** visualmente (borde/acento latón + etiqueta
     "Recomendado" o un `#1`), y numerar el resto discreto (#2..#5). El corte
     recomendado tiene que saltar a la vista sin leer.
   - Indicador de match **relativo** y **sin número** (barra corta normalizada
     al score del primero de la lista actual). **No** mostrar un porcentaje:
     el score es una suma ponderada sin tope, un "%" sería falsa precisión —y
     CLAUDE.md 3/12 evita justamente la confianza falsa. La barra es solo un
     apoyo visual de "más/menos", el orden ya es la señal fuerte.
   - Que el **diferenciador** salte: "camino en 2-3 cortes" ya tiene su línea;
     además, mover el dato que cambia entre cortes (los minutos de peinado, la
     longitud) a algo escaneable, no enterrado en la línea 2 del párrafo.

2. **Badge "Sin verificar" (#9-lista):** aparece en las 15 cards y compite con
   la info real (es temporal, hasta que el barbero verifique los cortes).
   Bajarle el peso: más chico, color `ink-faint`/latón tenue, sin recuadro
   gritón. Que esté, pero que no domine.

3. **Toggle de longitud:** aplicar `.chip`. "Todos" seleccionado en
   `bg-select`, que no compita con el latón de la acción.

4. **Detalle — jerarquía de la spec (#8):** Spec / Pasos / Cuidados hoy son 3
   paneles idénticos. La **spec técnica es lo que el barbero necesita YA para
   cortar**: destacarla (primera, más grande, o con acento) por sobre Cuidados
   (que son para después, para el cliente). No hace falta reordenar la lógica,
   solo la jerarquía visual.

5. **Jerarquía de acciones (#4):**
   - **"Este hice" es la señal más valiosa** (CLAUDE.md 2.3) y hoy es un botón
     gris empatado con el 👎. Subirle el peso: que sea la acción destacada del
     bloque de cierre (puede compartir peso con "Compartir al cliente", pero no
     puede quedar por debajo del descarte).
   - **Reemplazar el emoji 👎** por un ícono SVG (anti-patrón explícito: emoji
     como ícono; además renderiza distinto por OS). Usar un ícono de "pulgar
     abajo"/"descartar" de un set liviano (Lucide/Heroicons como SVG inline, o
     un SVG propio). El descarte es la acción **secundaria**: menor peso que
     "Este hice".
   - Revisar el orden visual: Compartir (primaria clara) → Este hice
     (destacada) → Descartar (secundaria discreta).

6. **Contraste (#5):** todos los `text-neutral-400/500` del "porqué", specs y
   notas → `text-ink-muted`.

**Terminado cuando:** build + tests verdes; capturas de Resultados (lista) y
Detalle (con el bloque de acciones y el estado de descarte abierto).

**Nota:** esta fase NO cambia `explain.ts` (eso es Fase E). El grueso del
hallazgo #1 se resuelve visualmente acá; el wording repetitivo se afina aparte
y con cuidado para no romper la calibración.

---

## Fase D — Buscar + ficha + ajustar + Datos y privacidad

**Objetivo:** aplicar el sistema al camino del 90% (cliente que vuelve) y a la
pantalla de datos. Es sobre todo restyle; la lógica de "Ajustar precarga" es la
Fase G (que toca datos), no esta.

**Archivos:** `src/screens/BuscarClienteScreen.tsx`,
`src/screens/DatosPrivacidadScreen.tsx`.

**Qué hacer:**

1. **Buscar / lista de fichas:** tokens en el input de búsqueda (subir el
   contraste del placeholder, hoy `neutral-600` casi ilegible → `ink-faint` o
   `ink-muted`), en las cards de cliente y estados vacíos. Alias en
   `font-display`.

2. **Ficha (morfología + historial):** paneles con `.panel`. La forma sugerida
   en `accent-ink` (latón texto), no lima. Historial legible con `ink-muted`.
   "Repetir el último" = `btn-primary`; "Ajustar" = `btn-secondary`.

3. **Ajustar (form):** reusa `BarberForm` (ya restyleado en B). Solo verificar
   que herede bien.

4. **Datos y privacidad:** `.panel` en las tres tarjetas. "Exportar todo" =
   `btn-primary`. El bloque "Borrar todo" con `border-danger` /
   `bg-danger-surface` y el botón de confirmación en rojo. Contraste de los
   textos de ayuda a `ink-muted`.

**Terminado cuando:** build + tests verdes; capturas de Buscar, Ficha, Ajustar,
Datos y privacidad (incluido el estado "confirmar borrado").

---

## Fase E — Motor: `explain.ts` (wording)

**Objetivo:** arreglar el texto del "porqué" sin tocar el scoring ni la
calibración.

**Archivos:** `src/engine/explain.ts` y su test (`explain.test.ts` o
equivalente — actualizar las aserciones de string que cambien).

**Qué hacer:**

1. **Bug de gramática:** hoy se renderiza *"Restó un poco por que pide 4 min de
   peinado…"* — "por que" separado. Corregir a "porque" o reescribir la
   cláusula negativa de minutos como frase que fluya después de "por" (ej.
   "…por el peinado: pide 4 min y el cliente dijo 2"). Elegir una y que quede
   gramatical.

2. **(Opcional, conservador) menos repetición:** el "afinidad X/5 con este
   corte" se repite en cada cláusula. Se puede acortar la muletilla sin sacar
   el dato. **No** rehacer la lógica de selección de cláusula dominante ni los
   pesos: es calibración sensible. Cambios mínimos y con tests actualizados.

**Terminado cuando:** `npm test` verde con las aserciones nuevas; revisar 2-3
frases de ejemplo a mano.

---

## Fase F — Ficha compartible PNG: solo-cliente + estilo A

**Objetivo:** que el PNG que se manda por WhatsApp lleve **solo lo que el
cliente necesita** (decisión del usuario) y con la estética Dirección A.
**Esto cambia CLAUDE.md 2.2** (que hoy pide la spec técnica en la imagen):
actualizar también ese texto del doc, o dejar una nota, para que no quede
contradiciendo al código.

**Archivos:** `src/engine/shareCard.ts` (contenido, puro, con tests),
`src/shareImage.ts` (dibujo en canvas), `engine/shareCard.test.ts`, y una nota
en `CLAUDE.md` 2.2.

**Qué hacer:**

1. **`shareCard.ts` (contenido):** sacar `specLineas` de `ShareCardContent` (o
   dejar de poblarlas). La ficha del cliente lleva: **imagen del maniquí,
   nombre del corte, "cada cuánto volver", producto + minutos de peinado, y la
   marca**. Nada de costados/#3/nuca — eso es lenguaje del barbero y vive en la
   app (Detalle) para él. Mantener intactas las prohibiciones ya documentadas
   (nunca foto del cliente, nunca "IA", nunca % de confianza — el comentario
   defensivo de cabecera del archivo sigue valiendo).
   - Ajustar el test para reflejar el nuevo contenido.

2. **`shareImage.ts` (dibujo):** actualizar los hex hardcodeados
   (`CARD_BG`/`PANEL_BG`/`ACCENT`/textos) a la paleta A (carbón/latón/crema) y
   el título a la fuente display (Oswald). Como es canvas, la fuente tiene que
   estar **cargada** antes de dibujar: `await document.fonts.ready` (o cargar
   la `FontFace` puntual) antes del `fillText`, con fallback a system-ui si no
   cargó. Sacar el panel de spec del layout; recomponer el vertical para que
   quede prolijo con menos bloques (la card es 1080×1350).

3. **Sin regresiones de compartir:** no tocar `shareCardPng` / el flujo de
   `canShare({files})` ni la activación transitoria (CLAUDE.md 2.2). Probar el
   fallback de descarga.

**Terminado cuando:** build + tests verdes; generar el PNG en Playwright
(desktop cae en el fallback de descarga → abrir el blob) y captura de la ficha
nueva. Nota de CLAUDE.md 2.2 actualizada.

---

## Fase G — Persistir el form en la ficha → "Ajustar" precarga

**Objetivo:** que "Ajustar" (cliente que vuelve) precargue textura, densidad,
minutos y largo, no solo los flags (decisión del usuario). Hoy arrancan en
blanco porque la ficha no los guarda, y eso suma taps al camino que debería ser
el más rápido.

**Archivos:** `src/types.ts`, `src/data/db.ts` (+ `db.test.ts`),
`src/screens/ResultsScreen.tsx` (path de guardado), `src/screens/BuscarClienteScreen.tsx`
(precarga).

**Qué hacer:**

1. **Tipo:** agregar a `ClienteFicha` un campo opcional con el último form
   usado, ej.:
   ```ts
   readonly ultimoForm?: {
     readonly textura: HairTexture
     readonly densidad: HairDensity
     readonly minutosDeclarados: number
     readonly largoActualArriba: LargoActualArriba
   }
   ```
   Opcional a propósito: las fichas viejas no lo tienen y se leen con `?? null`
   (precarga en blanco, como hoy). No va en `MorfologiaCliente` (eso es
   morfología física de la cara, esto es preferencia de la visita).

2. **Migración (CLAUDE.md 6, regla 4):** subir `DB_VERSION` 2 → 3 con un
   `if (oldVersion < 3)` que sea **no-op** sobre el store `fichas` (el campo es
   aditivo y opcional, no hay que reescribir registros). Igual **hay que subir
   la versión y dejar el bloque de migración** aunque no haga nada — es la
   regla del repo. No `clear()` ni recrear stores.

3. **Escritura:** cuando "Este hice" viene con un `BarberInput` real
   (`ResultsContext.barberInput` — camino cliente nuevo y camino Ajustar),
   guardar/actualizar `ultimoForm` en la ficha. `crearFicha` lo setea en la
   creación; para el camino `existente`, `agregarHistorial` (o una función
   nueva) también actualiza `ultimoForm`. El camino "Repetir el último" no
   tiene `barberInput` (results=null) → no toca `ultimoForm`, correcto.

4. **Precarga:** en `BuscarClienteScreen.openFicha`, si
   `ficha.ultimoForm` existe, inicializar textura/densidad/minutos/largo desde
   ahí (además de los flags que ya se precargan). Si no existe, en blanco como
   hoy.

5. **Tests:** `db.test.ts` — crear ficha con `ultimoForm`, agregar historial
   actualizando `ultimoForm`, y verificar que una base v2 vieja migra a v3 sin
   perder fichas (test de migración, que es justo lo que la regla 4 protege).

**Terminado cuando:** `npm test` verde (incluido el test de migración); en
Playwright, cerrar un "Este hice" con form completo, reabrir la ficha →
Ajustar → los 4 valores aparecen precargados.

---

## Resumen de mapeo hallazgo → fase

| # | Hallazgo (diagnóstico) | Fase |
|---|---|---|
| 1 | Resultados sin jerarquía / ranking | C (visual) + E (wording) |
| 2 | Sin sistema de color (lima para todo) | A |
| 3 | Form de cliente nuevo largo y plano | B |
| 4 | Jerarquía de acciones en detalle + emoji 👎 | C |
| 5 | Contraste bajo de secundarios | A (tokens) + B/C/D (aplicar) |
| 6 | Footer fijo tapa contenido | A |
| 7 | Tipografía sin sistema | A |
| 8 | Spec no priorizada en el detalle | C |
| 9 | Instrucción del handle verbosa | B |
| 10 | Estado vacío de la foto sin guía | B |
| — | Malla: puntos de colores siempre visibles | B |
| — | Ficha compartible solo-cliente | F |
| — | "Ajustar" no precarga textura/densidad/largo | G |
