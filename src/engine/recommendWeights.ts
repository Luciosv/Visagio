// Pesos w1-w7 del motor de recomendación (sección 9 de CLAUDE.md). La fórmula
// viene fijada por la spec, los números NO: "elegilos vos con criterio de
// partida razonable... se van a calibrar con uso real" (encargo de esta
// fase). Mismo patrón que `qualityThresholds.ts`/`faceShapeThresholds.ts`
// (sección 17: "los umbrales... en un solo archivo de constantes, comentados
// con su justificación").
//
// Escala de referencia para leer estos números: `afinidadForma`,
// `afinidadTextura` y `afinidadDensidad` van de 0 a 5 (sección 8). La
// confianza de forma (`top1.confidence`/`top2.confidence`) es una fracción
// de 0 a 1 que reparte entre las 7 formas (normalmente el top1 ronda
// 0.25-0.45, rara vez pasa de 0.6: ver `faceShape.test.ts`). `bonus`/
// `penalización` son la CANTIDAD de flags que matchean, no 0-1. El exceso de
// minutos de peinado es un número de minutos (típicamente 0-10).
//
// Criterio de reparto, de mayor a menor prioridad (ver sección 9 del
// prompt de esta fase: "priorizar forma de cara y favorece/penaliza sobre
// minutos de peinado"):
//   1. Forma de cara (w1, w2) — es el eje central del visagismo, la sección 1
//      define toda la app alrededor de esto.
//   2. Penalizar activamente un flag conocido (w6) — un corte que el oficio
//      sabe que no funciona con un remolino o una restricción puntual pesa
//      más en contra que a favor: es peor recomendar mal que no sumar bien.
//   3. Favorecer un flag conocido (w5) y textura/densidad (w3, w4) — señales
//      de oficio de peso medio.
//   4. Minutos de peinado (w7) — la spec lo pide último a propósito ("Filtrar
//      por longitud... no antes" es la misma lógica: es un ajuste fino, no un
//      criterio decisivo).

/**
 * Peso de la forma top-1 (la de mayor confianza). Multiplica
 * `afinidadForma[top1.shape] * top1.confidence`, con afinidad 0-5 y
 * confianza típica 0.25-0.6: el término normalmente da entre ~0.5 y ~3.
 * `W1 = 4` para que este término domine el score cuando la clasificación es
 * clara, sin que un afinidad/confianza bajos lo anulen del todo.
 */
export const W1_FORMA_TOP1 = 4

/**
 * Peso de la forma top-2. La mitad de `W1_FORMA_TOP1`: el top-2 es real
 * (sección 3: "clasificación blanda, nunca etiqueta única"), pero por
 * definición tiene menos confianza que el top-1, así que su influencia en el
 * score debería ser menor, no igual.
 */
export const W2_FORMA_TOP2 = 2

/**
 * Peso de la afinidad de textura. Escala 0-5 directa (sin multiplicar por
 * ninguna confianza), así que se mantiene por debajo de `W1` para que la
 * forma de cara siga siendo el criterio dominante incluso cuando la
 * clasificación de forma es ambigua (confianza baja).
 */
export const W3_TEXTURA = 1.5

/**
 * Peso de la afinidad de densidad. Algo menor que textura: en la experiencia
 * de oficio la textura (lacio/ondulado/rulo/muy rizado) condiciona más la
 * forma final del corte que la densidad (fino/medio/grueso), que afecta
 * sobre todo el mantenimiento.
 */
export const W4_DENSIDAD = 1

/**
 * Peso POR FLAG que matchea `cut.favorece ∩ flags` del cliente (el bonus
 * escala con la cantidad de flags que matchean, no es un valor fijo). Una
 * señal de oficio concreta y explicable (ver `explain.ts`), pesa más que
 * textura/densidad porque suele venir de una restricción real del cliente,
 * no de una preferencia estética.
 */
export const W5_BONUS_FAVORECE = 2

/**
 * Peso POR FLAG que matchea `cut.penaliza ∩ flags`. Mayor que
 * `W5_BONUS_FAVORECE` a propósito: recomendar un corte que el oficio sabe
 * que no funciona con, por ejemplo, un remolino de coronilla marcado es un
 * error más caro que no sumar puntos por una afinidad menor. Evitar una mala
 * recomendación pesa más que reforzar una buena (mismo principio que "no
 * auto-detectar tipo de pelo": preferir el criterio de oficio explícito).
 */
export const W6_PENALIZACION_PENALIZA = 3

/**
 * Peso POR MINUTO de exceso entre `minutosDePeinado` del corte y
 * `minutosDeclarados` del cliente. Deliberadamente el más chico de los
 * siete: es un ajuste fino de practicidad, no una señal de si el corte le
 * queda bien a la cara o al pelo. Con `W7 = 0.4`, un corte que pide 5
 * minutos más de lo declarado resta 2 puntos — perceptible pero nunca
 * suficiente para tapar una buena afinidad de forma.
 */
export const W7_PENALIZACION_PEINADO = 0.4
