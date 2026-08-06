# Visagio — Asistente de visagismo para barbería

> Doc de contexto del proyecto, v2. Leer completo antes de escribir código.

---

## 1. Contexto y usuarios

Dos usuarios reales, distintos:

- **El barbero** (iPhone). Usa la app **en la silla, con el cliente sentado y las
  manos ocupadas**. Es el usuario que importa.
- **El desarrollador** (Android). Prueba, mide y recibe los datos para iterar.

La app se llama asistente de **visagismo**, que es el término profesional del
oficio (del francés *visage*): el estudio de la morfología del rostro y el cráneo
para proponer un corte que equilibre proporciones. Usar ese vocabulario en toda
la UI. Es el lenguaje que el barbero ya maneja y le da credibilidad a la
herramienta.

### La restricción que define todo el diseño

La consulta previa al corte dura **30-60 segundos con un cliente conocido y
alrededor de 2 minutos con uno nuevo**. No es una sesión de diseño: es confirmar
que barbero y cliente están apuntando al mismo resultado antes de la primera
pasada de máquina.

**Si el flujo de la app tarda más de eso, no se usa.** Cualquier decisión de UX
se juzga contra este número. Es preferible una app que haga menos en 40 segundos
que una completa en tres minutos.

### El problema real que resuelve

El cliente habla en sensaciones, el barbero trabaja en especificaciones.
"No muy corto", "emprolijámelo" no significan nada hasta traducirlos a número de
máquina, altura del degradado y forma de nuca. Ahí es donde se pierden clientes.

Entonces la salida de la app **no es el nombre de un corte**: es una **ficha
concreta y compartible** con la especificación técnica, la imagen de referencia
en maniquí, y el porqué en términos de proporciones. Eso es lo que ninguna app de
"probate el corte" hace, y es lo diferencial.

### Principio rector

**La app propone, el barbero decide.** Todo dato inferido automáticamente es
visible, editable y corregible en un tap. La app es un instrumento de medición,
no un oráculo.

---

## 2. Las tres preguntas que motivaron esta versión

### 2.1. ¿Cuánto cuesta que ande en Android y iOS?

**Prácticamente nada, y por eso la webapp es la decisión correcta.** Un solo
código, un solo deploy, ambos abren la misma URL. Las diferencias reales son
cuatro y ninguna es estructural:

| | Android / Chrome | iOS / Safari |
|---|---|---|
| MediaPipe (WASM+GPU) | Anda | Anda, algo más lento |
| Cámara vía `<input capture>` | Anda | Anda |
| Instalar en pantalla de inicio | Instalación real con prompt | WebClip vía menú Compartir → hay que enseñarle a hacerlo una vez |
| `navigator.share` con archivos | Sí | Sí |
| **Persistencia local** | Estable | **Safari puede borrar `localStorage` tras ~7 días sin uso del sitio** |

Sólo la última fila importa de verdad, y es la razón principal por la que la
ficha de cliente **no puede vivir únicamente en el teléfono**. Ver sección 5.

Verificar el comportamiento de storage en el iPhone real, no asumirlo: el límite
se relaja para sitios agregados a la pantalla de inicio, pero hay que comprobarlo
en el dispositivo del primo antes de prometerle que no pierde datos.

### 2.2. ¿Cómo se lleva el resultado al WhatsApp del cliente?

**Imagen PNG, no PDF.** Se genera la ficha en un `<canvas>` y se comparte con la
Web Share API:

```ts
const file = new File([blob], 'corte.png', { type: 'image/png' });
if (navigator.canShare?.({ files: [file] })) {
  await navigator.share({ files: [file], title: 'Tu corte' });
} else {
  // fallback: <a download> + mensaje "guardá la imagen y mandala"
}
```

Por qué imagen y no PDF: WhatsApp la muestra inline en el chat, el cliente la ve
sin abrir nada, no depende de un visor de PDF, y funciona igual en los dos
sistemas. Chequear con `canShare({files})`, no con `share`, y siempre desde un
click del usuario (requiere activación transitoria).

El PDF queda como opción secundaria en un botón aparte, para cuando quiera
imprimir o armar un catálogo. No es prioridad del MVP.

**Qué lleva la imagen compartible:**
- Nombre del corte + imagen de maniquí
- La spec técnica en texto plano ("2 en los costados, degradado bajo, 6 cm arriba
  texturizado, nuca cuadrada")
- Cada cuánto volver
- Producto y cuánto tarda en peinarse a la mañana
- Marca de la barbería
- **Sin la foto del cliente**, sin la palabra "IA", sin porcentajes de confianza.
  Eso es interno del barbero, no del cliente.

### 2.3. ¿Cómo llegan los datos del barbero al desarrollador?

**Decisión: el MVP registra, pero todavía no sincroniza.**

El objetivo del MVP es poner una app usable en las manos del barbero cuanto antes.
Montar un backend antes de eso agrega una dependencia externa al camino crítico
sin agregar valor para él. Entonces se parte en dos:

**En el MVP (obligatorio):** cada evento se escribe en una **cola local
persistente**, con el formato definitivo de abajo. Además, un botón discreto
"Exportar" que baja la cola como JSON para mandarla por WhatsApp. Bajo costo,
cero infraestructura.

**Después del MVP (v1.1):** un worker vacía esa misma cola contra un backend
cuando hay red. Como el formato es el definitivo desde el día uno, **al conectar
el backend se sincroniza retroactivamente todo lo acumulado**. No se pierde nada
de lo que el barbero haya hecho mientras tanto.

Esto es lo que evita el error clásico de "el feedback lo agregamos después": si no
se registra desde el principio, las primeras semanas de uso real — las más
informativas — se pierden para siempre.

**Backend previsto para v1.1:** Supabase free tier, una tabla `eventos`, clave
anónima con política RLS de **solo INSERT**. Sin lecturas desde el cliente, sin
auth, sin usuarios. Alternativas equivalentes: Cloudflare Worker + D1 (mismo
ecosistema que Pages), o un webhook a Google Sheets si se prefiere leer los datos
en una planilla.

La app funciona **entera sin conexión** en las dos etapas. El wifi de una barbería
no es confiable y no puede haber un spinner entre el barbero y el cliente.

**Qué se manda (y qué no):**

```jsonc
{
  "ts": "2026-08-03T14:22:00Z",
  "sesion": "uuid-anónimo-del-dispositivo",
  "ratios": { "R1": 1.62, "R2": 0.88, "R3": 0.94, "R4": 118 },
  "formaSugerida": ["alargada", 0.61],
  "formaCorregida": "ovalada",          // null si no la tocó
  "ajusteLineaNacimiento": 0.07,        // delta normalizado
  "form": { "textura": "ondulado", "densidad": "media", "flags": ["remolino_coronilla"] },
  "ranking": ["french-crop", "low-fade-texturizado", "taper-bajo"],
  "elegido": "taper-bajo",
  "descartados": [{ "id": "french-crop", "motivo": "no_le_gusta_al_cliente" }],
  "segundosEnPantalla": 34
}
```

**Nunca**: fotos, landmarks crudos, nombre del cliente, nada que identifique a una
persona. Los ratios son números sueltos, no reconstruyen una cara.

**El feedback tiene que ser pasivo.** Un barbero no llena formularios entre
cliente y cliente. Lo que se registra sin fricción:

- Qué corte tocó (implícito)
- **Un solo botón: "este hice"** ← la señal más valiosa de todas
- 👎 con chips de motivo predefinidos, nunca texto libre:
  *no le gusta al cliente · no le va a la cara · el pelo no da · no lo mantiene ·
  mal ejecutable*
- Si corrigió la forma de cara detectada (implícito, y es oro puro para calibrar)

Un pulgar abajo con motivo es un tap. Un campo de texto es una feature que nadie
usa.

---

## 3. Decisiones cerradas

| Decisión | Razón |
|---|---|
| **Todo el análisis client-side** | Las fotos del cliente nunca salen del teléfono |
| **Sin backend en el MVP; cola local con formato definitivo** | Sacar la app a la calle rápido sin perder los datos de las primeras semanas |
| **Backend de telemetría anónima insert-only en v1.1** | Canal de vuelta sin comprometer privacidad |
| **Offline-first siempre** | El wifi de la barbería no puede frenar la consulta |
| **La app se actualiza sola, sin que el barbero haga nada** | Ver sección 6 |
| **No auto-detectar tipo de pelo** | El barbero toca el pelo: sabe más que cualquier clasificador. Un form de 4 taps es más rápido y más exacto |
| **Foto frontal únicamente** | MediaPipe pierde precisión fuerte en perfil |
| **`<input type="file" capture>`, no `getUserMedia`** | Cámara nativa, esquiva los bugs conocidos de cámara en PWA sobre WebKit, mejor calidad |
| **Salida = imagen PNG vía Web Share API** | Ver 2.2 |
| **Imágenes de maniquí generadas, no scrapeadas** | Consistencia visual y cero problema de derechos |
| **Clasificación blanda: top-2 con confianza, nunca etiqueta única** | La literatura reporta ~70-75% de exactitud. Una etiqueta sola con seguridad falsa quema la confianza en la primera equivocación |
| **Sin try-on en v1** | Ver sección 12 |

---

## 4. Stack

```
React 18 + TypeScript + Vite + Tailwind
@mediapipe/tasks-vision   (FaceLandmarker, 478 puntos, WASM + GPU)
Zustand para estado
idb (wrapper liviano de IndexedDB) para la ficha de cliente
Deploy: Cloudflare Pages — estático, HTTPS, gratis

En v1.1: Supabase JS client (solo insert)
```

La base de cortes es `cuts.json` versionado en el repo. Las imágenes de maniquí
son assets estáticos en `/public/cuts/`. El modelo `.task` de MediaPipe va
self-hosteado en `/public/models/`, no desde CDN.

---

## 5. Ficha de cliente — la feature que el oficio realmente pide

De la investigación sobre consultas de barbería, el dato más repetido es que
**"como la vez pasada" requiere notas**, y que la mayoría de los barberos las
lleva en un cuaderno o en la cabeza. Esto vale más para el negocio que la
detección de forma de cara.

Y encaja perfecto con el flujo: el análisis morfológico se hace **una sola vez por
cliente**. Después, cada visita es abrir la ficha.

```
Cliente nuevo      → análisis completo, ~90 s, una vez en la vida
Cliente que vuelve → abrir ficha, ver qué se le hizo, confirmar o ajustar, ~10 s
```

La segunda ruta es el 90% del uso real. **Diseñar la pantalla de inicio alrededor
de "buscar cliente", no de "sacar foto".**

Contenido de la ficha:
- Alias o apodo (el barbero elige cómo llamarlo; no hace falta nombre completo)
- Morfología: forma, ratios, flags (remolino, entradas, orejas, nuca)
- Historial: fecha, corte hecho, spec usada, nota corta
- Foto de referencia del último corte, **opcional y con consentimiento**

**Persistencia:** IndexedDB local (no `localStorage`, que es chico y se llena con
las fotos). Más **export/backup manual a archivo** que el barbero pueda guardar en
Drive, y **avisarle explícitamente que respalde**, dada la limitación de storage
en Safari de 2.1. Si la app se prueba bien, en v2 esto va a backend con auth y
deja de ser un problema.

**Acceso y control de los datos guardados.** Todo lo que la app junta sin que el
barbero lo pida explícitamente (fichas de cliente, cola de feedback de 2.3) tiene
que quedar accesible desde un lugar, no invisible dentro del teléfono. La entrada
es un link chico y discreto (no un botón grande en el flujo principal — pensarlo
al lado del número de versión, en el pie de la pantalla de inicio, ver sección
10) a una pantalla de **"Datos y privacidad"** que muestra cuántas fichas y
cuántos eventos de feedback hay guardados, y dos acciones: **exportar todo** a un
archivo (ya descripto en 2.3 y en esta sección) y **borrar todo** el
almacenamiento local, con confirmación. Esto es lo que le permite al barbero, en
cualquier momento y sin depender de acordarse de un flujo escondido, mandarle el
archivo al desarrollador o borrar todo si en algún momento no quiere tener esos
datos en su teléfono. No reemplaza el hábito de respaldo semanal de la sección 6,
es la puerta de entrada para hacerlo. Se implementa recién cuando exista algo que
mostrar: Fase 6 (ficha de cliente) y Fase 7 (cola de feedback), ver sección 16.

---

## 6. Actualizar la app sin fricción

El MVP es una versión mínima que se entrega **para seguir trabajando encima**. La
app va a cambiar todas las semanas mientras el barbero la usa. Si actualizar
implica pedirle que haga algo, o peor, si él sigue viendo una versión vieja sin
saberlo, el ciclo de iteración se rompe. Cuatro reglas:

**1. Los datos separados del código.**
`cuts.json` vive en `/public/data/`, se pide en runtime con `fetch`, no se importa
en el bundle. Así corregir un número de máquina es editar un JSON y hacer push:
sin tocar código, sin build de por medio, sin riesgo de romper nada.

**2. Nada de service worker en el MVP.**
Es la trampa clásica: se cachea la app, el barbero la agrega a la pantalla de
inicio, y durante días sigue viendo una versión vieja mientras vos jurás que ya lo
arreglaste. Diagnosticar eso a distancia es una pesadilla. El MVP va sin service
worker: Cloudflare Pages ya sirve rápido y los assets van con hash en el nombre.
Cuando la app se estabilice se agrega caché offline, con una estrategia explícita
de invalidación y no antes.

**3. Número de versión visible.**
Un `v0.4.2` chiquito en el pie de la pantalla de inicio, tomado del build. Cuando
él diga "no me aparece eso", la primera pregunta es qué versión ve. Sin esto, cada
bug reportado arranca con veinte minutos de confusión.

**4. Migraciones de datos desde el día uno.**
Esta es la importante. Apenas él empiece a cargar clientes, esa base local es
**irreemplazable**: no la tenés vos, no está en ningún servidor, y no se puede
reconstruir. Entonces IndexedDB con número de esquema y función de migración desde
la primera versión, aunque la primera migración sea un no-op. Un cambio de esquema
sin migración le borra los clientes, y ahí se termina la prueba.

Corolario: el botón de **exportar respaldo** de la sección 5 no es una comodidad,
es una red de seguridad. Que lo use una vez por semana hasta que haya backend.

**Feature flags.** Un `config.json` chico al lado de `cuts.json` con banderas
booleanas. Permite prender o apagar una pantalla sin redeploy, y desactivar algo
que salió mal sin esperar a un build. La primera bandera, `mostrarDebug`
(default `false`), se adelantó durante la Fase 5 para ocultar los paneles
numéricos de la sección 10 sin esperar al pulido de la Fase 7.

---

## 7. Pipeline de análisis

### 7.1. Captura

`<input type="file" accept="image/*" capture="environment">`.
Reducir a máx. 1024 px de lado largo en canvas antes de procesar.

### 7.2. Detección

`FaceLandmarker`, `runningMode: "IMAGE"`, `numFaces: 1`,
`outputFacialTransformationMatrixes: true`.

### 7.3. Gate de calidad — rechazar antes de medir

Si no pasa, pedir la foto de nuevo con un mensaje concreto y accionable
("giró la cabeza, mirá derecho a la cámara"):

- **Pose**: descomponer la matriz a yaw/pitch/roll. Rechazar si `|yaw| > 8°`,
  `|pitch| > 10°`, `|roll| > 10°`. El roll se corrige rotando, no rechazando.
- **Tamaño**: bounding box de la cara > 25% del alto de la imagen.
- **Nitidez**: varianza del laplaciano sobre la región facial.
- **Detección**: exactamente una cara.

### 7.4. Ajuste manual de la línea de nacimiento — crítico

El face mesh **no incluye el triquion**. El punto 10 es el borde superior de la
malla, que cae en la frente media-alta, no en el nacimiento del pelo. Para un
barbero eso es justamente lo que más importa: entradas, frente alta, retroceso.

Mostrar la foto con el punto sugerido y un handle arrastrable. **Un tap del
barbero y el largo de cara pasa de estimado a real.** Guardar el valor sugerido y
el corregido: el delta es dato de calibración.

### 7.5. Métricas

Razones adimensionales, no hace falta calibrar escala.

| | Definición |
|---|---|
| `R1` | largo de cara (nacimiento → mentón) / ancho bicigomático |
| `R2` | ancho de frente / ancho bicigomático |
| `R3` | ancho mandibular (gonion-gonion) / ancho bicigomático |
| `R4` | ángulo mandibular en el gonion |
| `R5` | altura de frente (nacimiento → cejas) / largo de cara |
| `R6` | tercios faciales: frente / nariz / mentón — el visagismo clásico usa esta división y es un dato que el barbero reconoce |

Índices de partida (**validar visualmente antes de confiar**, es fácil errarle por
uno):

```
mentón                   152
frente / triquion aprox  10       ← reemplazado por el ajuste manual
bicigomático             234, 454
gonion                   172, 397
ancho de frente          54, 284  (alt: 103/332, 21/251)
canto externo ojos       33, 263
centro de iris           468, 473
```

### 7.6. Clasificación

Reglas con puntaje difuso, no un clasificador entrenado: no hay dataset, es
explicable, y el barbero puede discutir el resultado.

Siete formas: ovalada, redonda, cuadrada, alargada, corazón, diamante,
triangular. Devolver **top-2 normalizado** más los ratios crudos:

> "Alargada 61% / Ovalada 34% — cara 1.62× más larga que ancha, mandíbula casi del
> mismo ancho que los pómulos."

Debajo, un selector para pisar el resultado. **Registrar cada corrección.**

### 7.7. Form del barbero — 4 taps

1. **Textura**: lacio / ondulado / rulo / muy rizado
2. **Densidad**: fino / medio / grueso
3. **Implantación**: remolinos · nuca · entradas · coronilla
4. **Restricciones**: orejas prominentes · cuello corto · gorra o casco · trabajo
   formal · minutos que está dispuesto a peinarse (0 / 2 / 5+)

El punto 4 es el que más valor agrega y ninguna app automática lo tiene.
Presentarlo como chips grandes, seleccionables con el pulgar, no como formulario.

---

## 8. Base de cortes

Ver `cuts.seed.json`, que ya trae **15 cortes precargados**: rapado, crew, taper
bajo, low/mid/high fade, french crop, undercut, side part, pompadour, capas
medias, mullet, rulos en capas, largo en capas, top knot.

**Todos vienen con `verificado: false`.** Los números de máquina, tiempos y pasos
salieron de fuentes públicas de barbería, no de conocimiento de taller. La primera
sesión con el barbero es corregirlos uno por uno y pasarlos a `true`. Un dato
técnico mal cargado que él detecte al toque le hace perder confianza en toda la
app, así que la UI debe marcar visiblemente los cortes sin verificar mientras dure
esa etapa.

Campos clave: `afinidadForma` (0-5 por forma), `afinidadTextura`,
`afinidadDensidad`, `favorece[]` / `penaliza[]` contra los flags del cliente,
`spec` (costados / arriba / nuca / contorno), `pasos[]`, `cuidados[]`,
`mantenimientoSemanas`, `minutosDePeinado`, `dificultad`, `tiempoEjecucionMin`.

---

## 9. Motor de recomendación

```
score = w1·afinidadForma[forma1]·conf1
      + w2·afinidadForma[forma2]·conf2
      + w3·afinidadTextura[textura]
      + w4·afinidadDensidad[densidad]
      + w5·bonus(favorece ∩ flags)
      - w6·penalización(penaliza ∩ flags)
      - w7·max(0, minutosDePeinado - tiempoDeclarado)
```

Filtrar por longitud con un toggle **en la pantalla de resultados**, no antes: el
barbero quiere poder comparar corto contra largo delante del cliente.

**`explain.ts` pesa tanto como el scoring.** Cada recomendación viene con una o
dos frases que citan la razón concreta:

> "Sumó por mandíbula marcada (R3 0.94), el degradado bajo acompaña el ángulo.
> Restó un poco por el remolino en coronilla."

Sin explicación el barbero no lo puede usar delante del cliente, y ahí muere.

**Expectativas alcanzables.** A veces la respuesta correcta es "hoy no": un
remolino profundo, una entrada, o simplemente le faltan cinco centímetros de
crecimiento. Cuando un corte puntúa alto pero requiere más largo del que hay,
mostrarlo como **"camino en 2-3 cortes"** en vez de esconderlo. Es exactamente la
conversación que evita la decepción frente al espejo, y ningún competidor la hace.

---

## 10. Flujo de pantallas

```
INICIO
 ├─ [Buscar cliente]  ← ruta principal, 90% del uso
 │    └─ Ficha → historial → "repetir el último" / "ajustar" → Resultados
 ├─ [Cliente nuevo]
 │    └─ Foto → gate de calidad → ajuste de nacimiento
 │       → forma + override → form de 4 taps → RESULTADOS
 └─ (pie, chico, al lado de la versión) "Datos y privacidad"
      → cuánto hay guardado, exportar todo, borrar todo (ver sección 5)

RESULTADOS
 ├─ toggle corto / medio / largo
 ├─ cards con maniquí + una línea de porqué
 └─ Detalle → spec · pasos · cuidados · mantenimiento
      ├─ [Compartir al cliente]  → PNG por Web Share
      ├─ [Este hice]             → cierra la consulta y guarda en la ficha
      └─ [👎 + motivo]
```

Reglas de UI, en serio:
- Targets de 56 px mínimo, todo alcanzable con un pulgar
- Contraste alto: la barbería tiene luz fuerte y espejos
- Nada de scroll horizontal, nada de hover, nada de menús anidados
- **El overlay de la malla de puntos sobre la foto queda siempre visible**,
  no es "debug": da una sensación profesional y muestra la tecnología. Lo que
  sí va detrás de un flag (`mostrarDebug` en `config.json`, ver sección 6) son
  los paneles numéricos (yaw/pitch/roll/nitidez, calibración de nacimiento,
  el grid crudo de R1-R6) — esos números no tienen valor para el barbero en
  el día a día, la versión legible ya la da la frase explicativa de la forma
  de cara. Decisión tomada mientras se probaba la Fase 5, adelantada respecto
  del pulido general de la Fase 7 porque si no cada prueba con el barbero
  arranca con ruido visual que no le sirve.

---

## 11. Alcance del MVP

**Dentro:**
1. Captura de foto frontal + gate de calidad
2. Ajuste manual de línea de nacimiento
3. Ratios + forma top-2 + override
4. Form de 4 taps
5. Toggle de longitud + top 3-5 con maniquí, porqué, spec, pasos, cuidados
6. Compartir ficha como PNG al WhatsApp del cliente
7. Ficha de cliente con historial local + export de respaldo
8. Registro local de feedback (cola con formato definitivo) + botón de exportar
9. Versión visible y migraciones de IndexedDB
10. Pantalla discreta "Datos y privacidad": ver cuánto hay guardado, exportar
    todo, borrar todo (sección 5)

**Explícitamente después del MVP (v1.1), no antes:**
- Sincronización de la cola de feedback contra el backend
- Service worker y caché offline

**Fuera, no empezar sin preguntar:**
- Try-on / simulación del corte en la persona
- Detección automática de tipo de pelo
- Cuentas, login, multi-barbero
- Perfil lateral, barba, color
- Turnos, agenda, cobros

---

## 12. Limitaciones conocidas — decirlas, no esconderlas

1. **La clasificación de forma no es exacta.** Los métodos por landmarks
   publicados reportan alrededor de 70-75% de acierto, y las herramientas
   comerciales se contradicen entre sí en los casos ambiguos (diamante vs corazón
   es el clásico). De ahí: top-2, confianza visible, override.
2. **"Forma de cara" es una convención, no anatomía.** Distintas escuelas usan 4,
   5, 6, 7 o 9 categorías. Se eligen 7 y se documenta.
3. **MediaPipe no da el nacimiento del pelo.** De ahí el ajuste manual.
4. **Sensible a la foto.** El selfie a 30 cm distorsiona: ensancha la nariz y
   angosta la mandíbula. Recomendar foto a ~1,5 m con cámara trasera.
5. **Storage en iOS.** Ver 2.1. Respaldo manual obligatorio hasta que haya backend
   con auth.
6. **El visagismo no es sólo la cara.** El oficio también mira cráneo, perfil,
   cuello, hombros y altura. Se está modelando una parte del problema, y conviene
   que la app lo diga en vez de aparentar completitud.

---

## 13. Sobre el try-on

Está resuelto técnicamente por terceros (Perfect Corp/YouCam, LightX) o por
generación con modelos de imagen, hoy en el orden de USD 0.04 por imagen. Queda
fuera de la v1 por tres razones:

- Costo por uso, contra el objetivo explícito de "que la use sin límites"
- Requiere subir la foto del cliente a un tercero: hace falta consentimiento
- Un resultado mediocre **con el cliente mirando la pantalla** hace más daño que no
  tener la feature

Reevaluar sólo si el barbero lo pide después de usar la v1. Si lo pide, la forma
correcta es bajo demanda (un botón, no automático) y con tope mensual.

---

## 14. Privacidad

Las fotos son de clientes reales y son datos biométricos.

- El análisis es íntegramente en el navegador. La foto no se sube a ningún lado.
- La foto de análisis se descarta al cerrar la consulta.
- La foto de referencia en la ficha es **opcional**, local, y requiere
  consentimiento del cliente. Debe poder borrarse de a una.
- La telemetría no incluye imágenes, landmarks crudos ni identificadores.
- Cartel visible en la app: "las fotos no se guardan ni se envían".
- Si en v2 aparece el try-on con API externa, hace falta consentimiento explícito
  antes de subir nada, y conviene revisar qué exige la Ley 25.326 de Protección de
  Datos Personales para datos biométricos.

---

## 15. Assets de maniquí

Cabezas blancas sin rasgos faciales, mismo ángulo (3/4 y posterior), misma
iluminación, fondo neutro. Generar en una sola tanda con prompt base fijo,
variando sólo la descripción del corte.

15 cortes × 2 vistas ≈ 30 imágenes ≈ un par de dólares, **una sola vez**. Después
son estáticas, costo cero por uso. Revisar una por una y descartar las raras: un
maniquí con anatomía imposible hace más daño que la falta de imagen.

WebP, ~600 px, para que cargue rápido con datos móviles.

---

## 16. Plan por fases

Las fases 0 a 7 son el MVP que se entrega. De la 8 en adelante es trabajo posterior
sobre una app que ya está en uso.

**Fase 0 — Andamiaje.** Vite + React + TS + Tailwind desplegado en Cloudflare
Pages y abriéndose en el iPhone del barbero y en el Android. Versión visible en el
pie. Antes de escribir lógica.

**Fase 1 — Visión.** MediaPipe devolviendo 478 landmarks sobre foto subida.
Overlay de debug. `quality.ts` con el gate de pose. **Validar los índices de
landmark contra caras reales antes de seguir.**

**Fase 2 — Medición.** `metrics.ts` con R1-R6. Handle de línea de nacimiento.
Pantalla que muestra los ratios crudos. Probar con 10-15 fotos de gente conocida y
ver si los números tienen sentido antes de clasificar nada.

**Fase 3 — Clasificación.** `faceShape.ts` difuso, top-2 + confianza + override.

**Fase 4 — Motor y datos.** Cargar `cuts.seed.json`, `recommend.ts`, `explain.ts`.
Generar assets de maniquí.

**Fase 5 — Resultados y compartir.** Cards, detalle, toggle, generación de PNG y
Web Share. **Probar el compartir en los dos teléfonos antes de seguir**: es la
feature con más riesgo de comportarse distinto entre plataformas.

**Fase 6 — Ficha de cliente.** IndexedDB **con esquema versionado y migración
desde el arranque**, búsqueda, historial, export de respaldo. Acá se arma la
pantalla "Datos y privacidad" de la sección 5, con lo que ya hay para mostrar de
la ficha (exportar / borrar todo).

**Fase 7 — Registro de feedback y entrega.** Cola local con el formato definitivo
de 2.3, botón de exportar, chips de motivo, botón "este hice". Sumar la cola de
feedback a la pantalla "Datos y privacidad" de la Fase 6 (mismo exportar / borrar,
ahora con las dos fuentes). Pulido mobile. Sesión con el barbero para corregir los
15 cortes y pasarlos a `verificado: true`. Enseñarle a agregar la app a la
pantalla de inicio, a exportar el respaldo, y dónde está el botón de borrar todo
por si en algún momento quiere usarlo.

→ **Acá se entrega el MVP.**

---

**Fase 8 (v1.1) — Sincronización.** Supabase insert-only, worker de flush,
sincronización retroactiva de todo lo acumulado en la cola.

**Fase 9 (v1.1) — Offline real.** Service worker con estrategia de invalidación
explícita, recién cuando la app dejó de cambiar todos los días.

**Fase 10 en adelante.** Lo que salga del feedback, no lo que estaba planeado hoy.

---

## 17. Convenciones

- Todo el texto de UI en español rioplatense (voseo). Sin inglés en pantalla, salvo
  los nombres de corte que el oficio ya usa en inglés (fade, taper, crop).
- Nada de `any`. Los tipos viven en `src/types.ts` y son la fuente de verdad.
- `vision/` y `engine/` con funciones **puras y testeables**: entran números, salen
  números. Nada de DOM ahí adentro.
- Tests unitarios de `metrics.ts` y `faceShape.ts` con landmarks fixture (JSON
  congelado de una detección real). Es la única parte donde un bug es silencioso.
- Los umbrales de clasificación en un solo archivo de constantes, comentados con su
  justificación. Van a cambiar mucho durante la calibración.
- Todo lo que toque red va detrás de una capa que asume que la red no existe.

---

## 18. Cómo trabajar en este repo

Antes de implementar una fase, proponer el plan y esperar confirmación. No saltar
fases. No agregar nada de la lista de "fuera de alcance" sin preguntar.

Si un umbral, un índice de landmark o un dato de barbería parece dudoso, decirlo en
vez de elegir uno y seguir. La calibración es el 80% del trabajo real acá, y el
conocimiento de oficio lo aporta el barbero, no el modelo.
