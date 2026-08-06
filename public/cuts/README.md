# Imágenes de maniquí — placeholders temporales

`placeholder-3-4.svg` y `placeholder-posterior.svg` son siluetas genéricas
reutilizadas por los 15 cortes de `public/data/cuts.seed.json`. No representan
ningún corte en particular: son solo para que el campo `imagenes` de cada
corte apunte a algo que existe y las cards de la Fase 5 no rompan por un 404.

Reemplazar por las imágenes de maniquí reales de la sección 15 de CLAUDE.md
(cabezas blancas sin rasgos faciales, mismo ángulo 3/4 y posterior, misma
iluminación, fondo neutro, WebP ~600px) cuando se generen. Mientras tanto,
`verificado: false` en cada corte ya señala que todo el registro —incluidas
estas imágenes— es un punto de partida a revisar, no un dato final.

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
