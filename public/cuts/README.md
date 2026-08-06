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
