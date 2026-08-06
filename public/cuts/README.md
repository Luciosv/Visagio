# Imágenes de maniquí

Vista 3/4 (`<id>-3-4.webp`): las 15 imágenes reales de la sección 15 de
CLAUDE.md, una por corte de `public/data/cuts.seed.json`. Generadas con
Nano Banana 2 a partir de una misma cabeza base (mismo maniquí blanco sin
rasgos faciales, mismo ángulo 3/4, misma iluminación, fondo neutro) variando
solo el pelo, y procesadas a WebP ~600px de lado largo.

Vista posterior: todavía en `placeholder-posterior.svg` (silueta genérica),
no generada. La app hoy solo usa la vista 3/4 (cards, detalle, ficha
compartible); la posterior queda pendiente para cuando haga falta.

`verificado: false` en cada corte de `cuts.seed.json` sigue señalando que el
resto del registro (spec, pasos, tiempos) es un punto de partida a revisar
con el barbero, no un dato final — no aplica a las imágenes, que ya son
definitivas.

## `largoMinimoArribaCm` (Fase 5)

Cada corte de `cuts.seed.json` trae, desde la Fase 5, un campo
`largoMinimoArribaCm`: el mínimo de centímetros de largo arriba que necesita
ese corte para ejecutarse razonablemente. Se usa para "expectativas
alcanzables" (sección 9 de CLAUDE.md): si el cliente todavía no tiene ese
largo, el corte no se esconde del ranking, se marca como "camino en 2-3
cortes".

Son estimados de arranque con criterio general de barbería (en la mayoría de
los casos, tomados directo del mínimo de `spec.arriba` de cada corte), **no
verificados** — mismo estado que el resto de cada registro
(`verificado: false`). A confirmar con el barbero real en la sesión de
calibración de la Fase 7, igual que los números de máquina y los tiempos.
